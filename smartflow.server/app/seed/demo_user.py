import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.config import Settings
from app.models import (
    Customer,
    CustomerType,
    Plant,
    User,
    UserRole,
    WalletTransaction,
    WalletTransactionType,
)

logger = logging.getLogger(__name__)


async def _upsert_user(
    session: AsyncSession,
    email: str,
    first_name: str,
    last_name: str,
    password: str,
    role: UserRole,
    plant_id: int | None = None,
) -> User:
    user = (
        await session.scalars(select(User).where(User.email == email))
    ).one_or_none()
    if user is None:
        user = User(
            email=email,
            first_name=first_name,
            last_name=last_name,
            password_hash=hash_password(password),
            role=role,
            plant_id=plant_id,
        )
        session.add(user)
        await session.flush()
        logger.info("seed.user id=%s email=%s role=%s", user.id, user.email, role.value)
    return user


async def seed(session: AsyncSession, settings: Settings) -> None:
    # Admin
    await _upsert_user(
        session,
        email=settings.ADMIN_EMAIL,
        first_name=settings.ADMIN_FIRST_NAME,
        last_name=settings.ADMIN_LAST_NAME,
        password=settings.ADMIN_PASSWORD,
        role=UserRole.admin,
    )

    # Manager — linked to the first plant
    plant = (await session.scalars(select(Plant).limit(1))).one_or_none()
    plant_id = plant.id if plant else None
    await _upsert_user(
        session,
        email=settings.MANAGER_EMAIL,
        first_name=settings.MANAGER_FIRST_NAME,
        last_name=settings.MANAGER_LAST_NAME,
        password=settings.MANAGER_PASSWORD,
        role=UserRole.manager,
        plant_id=plant_id,
    )

    # Demo customer
    customer_user = await _upsert_user(
        session,
        email=settings.DEMO_EMAIL,
        first_name=settings.DEMO_FIRST_NAME,
        last_name=settings.DEMO_LAST_NAME,
        password=settings.DEMO_PASSWORD,
        role=UserRole.customer,
    )

    customer = (
        await session.scalars(select(Customer).where(Customer.user_id == customer_user.id))
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
        customer = Customer(user_id=customer_user.id, customer_type_id=ct.id)
        session.add(customer)
        await session.flush()
        logger.info("seed.customer id=%s type=%s", customer.id, ct.name)

    existing_opening = (
        await session.scalars(
            select(WalletTransaction).where(
                WalletTransaction.user_id == customer_user.id,
                WalletTransaction.transaction_type == WalletTransactionType.credit,
            )
        )
    ).first()
    if existing_opening is None and settings.INITIAL_BALANCE > 0:
        session.add(
            WalletTransaction(
                user_id=customer_user.id,
                amount=Decimal(str(settings.INITIAL_BALANCE)),
                transaction_type=WalletTransactionType.credit,
            )
        )
        logger.info("seed.wallet.opening user=%s amount=%s", customer_user.id, settings.INITIAL_BALANCE)
    await session.flush()
