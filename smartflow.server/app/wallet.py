"""
Wallet = ledger over `wallet_transactions` + live sums over in-flight purchases.

- `balance`       = sum(credit) - sum(debit)
- `hold`          = sum(price for price on pending/started Purchase rows)  [live]
- `daily_consumed`= litres on today's terminal-success Purchase rows
- `daily_hold`    = litres on today's pending/started Purchase rows  [live]

Booking a hold only creates DB rows (Purchase), it does NOT write to
wallet_transactions. Actual debit happens when a cane acks and starts
dispensing — at that point we write one `debit` transaction for the cane's
price. Refunds on partial delivery are written as `credit` transactions
linked to the same purchase_id.

Pricing is looked up via the Customer → CustomerType → Price chain; the
Customer's current CustomerType.price_id is what the purchase snapshots.
"""

import logging
from datetime import date, datetime, time, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Customer,
    CustomerType,
    Limit,
    Price,
    Purchase,
    PurchaseStatus,
    User,
    WalletTransaction,
    WalletTransactionType,
)

logger = logging.getLogger(__name__)


class WalletError(Exception):
    def __init__(self, code: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

async def load_customer(session: AsyncSession, user_id: int) -> Customer:
    customer = (
        await session.scalars(select(Customer).where(Customer.user_id == user_id))
    ).one_or_none()
    if customer is None:
        raise WalletError("customer_not_found", "Customer profile missing")
    return customer


async def current_price_and_limit(
    session: AsyncSession, customer: Customer
) -> tuple[Price, Limit]:
    ct = await session.get(CustomerType, customer.customer_type_id)
    if ct is None:
        raise WalletError("customer_type_missing", "Customer type missing")
    price = await session.get(Price, ct.price_id)
    limit = await session.get(Limit, ct.limit_id)
    if price is None or limit is None:
        raise WalletError("rate_missing", "No active price/limit for customer type")
    return price, limit


# ---------------------------------------------------------------------------
# Ledger reads
# ---------------------------------------------------------------------------

async def balance(session: AsyncSession, user_id: int) -> Decimal:
    credit = await session.scalar(
        select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
            WalletTransaction.user_id == user_id,
            WalletTransaction.transaction_type == WalletTransactionType.credit,
        )
    ) or Decimal("0")
    debit = await session.scalar(
        select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(
            WalletTransaction.user_id == user_id,
            WalletTransaction.transaction_type == WalletTransactionType.debit,
        )
    ) or Decimal("0")
    return Decimal(credit) - Decimal(debit)


_HOLD_STATUSES = (PurchaseStatus.pending, PurchaseStatus.started)


async def hold(session: AsyncSession, user_id: int) -> Decimal:
    """Sum of `litres_count * price.unit_price` for this user's in-flight purchases."""
    total = await session.scalar(
        select(
            func.coalesce(func.sum(Purchase.litres_count * Price.unit_price), 0)
        )
        .join(Price, Price.id == Purchase.price_id)
        .where(
            Purchase.user_id == user_id,
            Purchase.status.in_(_HOLD_STATUSES),
        )
    ) or Decimal("0")
    return Decimal(total)


def _today_bounds() -> tuple[datetime, datetime]:
    today = date.today()
    start = datetime.combine(today, time.min, tzinfo=timezone.utc)
    end = datetime.combine(today, time.max, tzinfo=timezone.utc)
    return start, end


async def daily_consumed_litres(session: AsyncSession, user_id: int) -> Decimal:
    """Litres on today's Purchase rows that have actually dispensed (any positive delivery)."""
    start, end = _today_bounds()
    total = await session.scalar(
        select(func.coalesce(func.sum(Purchase.litres_delivered), 0)).where(
            Purchase.user_id == user_id,
            Purchase.date_time >= start,
            Purchase.date_time <= end,
        )
    ) or Decimal("0")
    return Decimal(total)


async def daily_hold_litres(session: AsyncSession, user_id: int) -> Decimal:
    start, end = _today_bounds()
    total = await session.scalar(
        select(func.coalesce(func.sum(Purchase.litres_count), 0)).where(
            Purchase.user_id == user_id,
            Purchase.status.in_(_HOLD_STATUSES),
            Purchase.date_time >= start,
            Purchase.date_time <= end,
        )
    ) or Decimal("0")
    return Decimal(total)


async def snapshot(session: AsyncSession, user_id: int) -> dict:
    """One-shot wallet view for `/api/me`."""
    customer = await load_customer(session, user_id)
    price, limit = await current_price_and_limit(session, customer)
    bal = await balance(session, user_id)
    hld = await hold(session, user_id)
    consumed = await daily_consumed_litres(session, user_id)
    held_litres = await daily_hold_litres(session, user_id)
    return {
        "balance": bal,
        "hold_balance": hld,
        "price_per_litre": price.unit_price,
        "currency": price.currency,
        "daily_limit_litres": limit.daily_litre_limit,
        "daily_consumed_litres": consumed,
        "daily_hold_litres": held_litres,
        "daily_remaining_litres": max(
            Decimal("0"), limit.daily_litre_limit - consumed - held_litres
        ),
    }


# ---------------------------------------------------------------------------
# Ledger writes (called by purchase_service)
# ---------------------------------------------------------------------------

async def record_debit(
    session: AsyncSession, user_id: int, amount: Decimal, purchase_id: int
) -> WalletTransaction:
    tx = WalletTransaction(
        user_id=user_id,
        amount=amount,
        transaction_type=WalletTransactionType.debit,
        purchase_id=purchase_id,
    )
    session.add(tx)
    logger.info("wallet.debit user=%s amount=%s purchase=%s", user_id, amount, purchase_id)
    return tx


async def record_credit(
    session: AsyncSession, user_id: int, amount: Decimal, purchase_id: int | None = None
) -> WalletTransaction:
    tx = WalletTransaction(
        user_id=user_id,
        amount=amount,
        transaction_type=WalletTransactionType.credit,
        purchase_id=purchase_id,
    )
    session.add(tx)
    logger.info("wallet.credit user=%s amount=%s purchase=%s", user_id, amount, purchase_id)
    return tx


# ---------------------------------------------------------------------------
# Hold checks at purchase creation
# ---------------------------------------------------------------------------

async def assert_can_afford(
    session: AsyncSession,
    user_id: int,
    price_total: Decimal,
    litres_total: Decimal,
) -> None:
    """Raise WalletError if this new purchase would overdraw balance or daily limit."""
    bal = await balance(session, user_id)
    hld = await hold(session, user_id)
    free = bal - hld
    if free < price_total:
        raise WalletError(
            "insufficient_balance",
            f"Need {price_total}, free {free} (balance {bal} − hold {hld})",
            required=str(price_total),
            available=str(free),
        )

    customer = await load_customer(session, user_id)
    _, limit = await current_price_and_limit(session, customer)
    consumed = await daily_consumed_litres(session, user_id)
    held_litres = await daily_hold_litres(session, user_id)
    projected = consumed + held_litres + litres_total
    if projected > limit.daily_litre_limit:
        raise WalletError(
            "over_daily_limit",
            f"Daily limit {limit.daily_litre_limit} L exceeded",
            limit=str(limit.daily_litre_limit),
            consumed=str(consumed),
            hold=str(held_litres),
            requested=str(litres_total),
        )
