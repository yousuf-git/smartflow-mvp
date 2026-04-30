"""
Virtual Wallet & Financial Ledger Management

This module implements the financial core of the SmartFlow system. It manages 
a virtual currency ledger for users, tracking credits (deposits/refunds) 
and debits (purchases). 

Key Concepts:
- Balance: The net sum of all ledger transactions (Credits - Debits).
- Hold: The total value of in-flight purchases that have been requested but 
  not yet debited from the ledger.
- Daily Limit: Consumption constraints defined per CustomerType.
- Invariants: The system ensures `Balance - Hold >= 0` and `Daily Consumed + 
  Daily Hold + New Request <= Limit`.

Connections:
- Used by: app.purchase_service (to check affordability and record transactions), 
  app.routes_customer (to display wallet stats).
- Uses: app.models (WalletTransaction, Customer, Price, Limit).
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
    """Custom exception for wallet-related validation failures."""
    def __init__(self, code: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra


# ---------------------------------------------------------------------------
# Database Lookups
# ---------------------------------------------------------------------------

async def load_customer(session: AsyncSession, user_id: int) -> Customer:
    """Fetches the Customer profile linked to a User ID."""
    customer = (
        await session.scalars(select(Customer).where(Customer.user_id == user_id))
    ).one_or_none()
    if customer is None:
        raise WalletError("customer_not_found", "Customer profile missing")
    return customer


async def current_price_and_limit(
    session: AsyncSession, customer: Customer
) -> tuple[Price, Limit]:
    """Retrieves the active Price and Limit records for a customer's type."""
    ct = await session.get(CustomerType, customer.customer_type_id)
    if ct is None:
        raise WalletError("customer_type_missing", "Customer type missing")
    price = await session.get(Price, ct.price_id)
    limit = await session.get(Limit, ct.limit_id)
    if price is None or limit is None:
        raise WalletError("rate_missing", "No active price/limit for customer type")
    return price, limit


# ---------------------------------------------------------------------------
# Ledger Analysis (Read-only)
# ---------------------------------------------------------------------------

async def balance(session: AsyncSession, user_id: int) -> Decimal:
    """Calculates the current ledger balance (total credits - total debits)."""
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


# Statuses that count towards the 'Hold' balance
_HOLD_STATUSES = (PurchaseStatus.pending, PurchaseStatus.started)


async def hold(session: AsyncSession, user_id: int) -> Decimal:
    """
    Sum of projected costs for all active (pending/started) purchases.
    Ensures users cannot spend more than they have while orders are in-flight.
    """
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
    """Utility to get UTC timestamps for the start and end of the current day."""
    today = date.today()
    start = datetime.combine(today, time.min, tzinfo=timezone.utc)
    end = datetime.combine(today, time.max, tzinfo=timezone.utc)
    return start, end


async def daily_consumed_litres(session: AsyncSession, user_id: int) -> Decimal:
    """Calculates total litres already delivered today."""
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
    """Calculates total litres requested in pending/started orders for today."""
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
    """
    Generates a comprehensive summary of a user's wallet state.
    Used by frontend dashboards to show balance, limits, and remaining quota.
    """
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
# Ledger Persistence (Write operations)
# ---------------------------------------------------------------------------

async def record_debit(
    session: AsyncSession, user_id: int, amount: Decimal, purchase_id: int
) -> WalletTransaction:
    """Records a payment for water dispensed."""
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
    """Records a deposit or a refund."""
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
# Business Logic Guards
# ---------------------------------------------------------------------------

async def assert_can_afford(
    session: AsyncSession,
    user_id: int,
    price_total: Decimal,
    litres_total: Decimal,
) -> None:
    """
    Performs critical pre-purchase checks.
    
    Validates:
    1. The user has enough 'free' balance (Balance - Hold) to cover the cost.
    2. The user has enough remaining daily quota to cover the volume.
    
    Raises:
        WalletError: If balance is insufficient or daily limit is exceeded.
    """
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
