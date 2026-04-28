"""
Demo user + customer + opening-balance credit.

V1.1 has no auth — one demo user carries the whole flow. Opening balance is
seeded as a single `credit` wallet_transaction so the ledger is the sole
source of truth.
"""

import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import (
    Customer,
    CustomerType,
    User,
    WalletTransaction,
    WalletTransactionType,
)

logger = logging.getLogger(__name__)


async def seed(session: AsyncSession, settings: Settings) -> None:
    user = (
        await session.scalars(select(User).where(User.email == settings.DEMO_EMAIL))
    ).one_or_none()
    if user is None:
        user = User(
            email=settings.DEMO_EMAIL,
            first_name=settings.DEMO_FIRST_NAME,
            last_name=settings.DEMO_LAST_NAME,
        )
        session.add(user)
        await session.flush()
        logger.info("seed.user id=%s email=%s", user.id, user.email)

    customer = (
        await session.scalars(select(Customer).where(Customer.user_id == user.id))
    ).one_or_none()
    if customer is None:
        ct = (
            await session.scalars(
                select(CustomerType).where(CustomerType.name == settings.DEMO_CUSTOMER_TYPE)
            )
        ).one_or_none()
        if ct is None:
            raise RuntimeError(
                f"CustomerType '{settings.DEMO_CUSTOMER_TYPE}' not seeded — check seed order"
            )
        customer = Customer(user_id=user.id, customer_type_id=ct.id)
        session.add(customer)
        await session.flush()
        logger.info("seed.customer id=%s type=%s", customer.id, ct.name)

    existing_opening = (
        await session.scalars(
            select(WalletTransaction).where(
                WalletTransaction.user_id == user.id,
                WalletTransaction.transaction_type == WalletTransactionType.credit,
            )
        )
    ).first()
    if existing_opening is None and settings.INITIAL_BALANCE > 0:
        session.add(
            WalletTransaction(
                user_id=user.id,
                amount=Decimal(str(settings.INITIAL_BALANCE)),
                transaction_type=WalletTransactionType.credit,
            )
        )
        logger.info("seed.wallet.opening user=%s amount=%s", user.id, settings.INITIAL_BALANCE)
    await session.flush()
