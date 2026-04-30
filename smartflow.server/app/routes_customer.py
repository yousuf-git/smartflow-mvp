import logging
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_role
from app.db import get_sessionmaker
from app.models import (
    OperatingHour,
    Plant,
    Price,
    Purchase,
    PurchaseGroup,
    PurchaseStatus,
    Tap,
    User,
    UserRole,
    WalletTransaction,
    WalletTransactionType,
)
from app.schemas import (
    CustomerDashboardOut,
    CustomerPlantOut,
    CustomerPurchaseOut,
    OperatingHourOut,
    TransactionListOut,
)
from app import wallet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/customer", tags=["customer"])


async def _db():
    sm = get_sessionmaker()
    async with sm() as s:
        yield s


@router.get("/dashboard", response_model=CustomerDashboardOut)
async def customer_dashboard(
    user: User = Depends(require_role(UserRole.customer)),
    session: AsyncSession = Depends(_db),
):
    snap = await wallet.snapshot(session, user.id)

    total_orders = (await session.scalar(
        select(func.count(PurchaseGroup.id)).where(PurchaseGroup.user_id == user.id)
    )) or 0

    total_litres = float(await session.scalar(
        select(func.coalesce(func.sum(Purchase.litres_delivered), 0))
        .where(
            Purchase.user_id == user.id,
            Purchase.status.in_([PurchaseStatus.completed, PurchaseStatus.partial_completed]),
        )
    ) or 0)

    return CustomerDashboardOut(
        balance=float(snap["balance"]),
        hold_balance=float(snap["hold_balance"]),
        daily_limit_litres=float(snap["daily_limit_litres"]),
        daily_consumed_litres=float(snap["daily_consumed_litres"]),
        daily_remaining_litres=float(snap["daily_remaining_litres"]),
        price_per_litre=float(snap["price_per_litre"]),
        currency=str(snap["currency"]),
        total_orders=total_orders,
        total_litres=total_litres,
    )


@router.get("/transactions", response_model=list[TransactionListOut])
async def customer_transactions(
    user: User = Depends(require_role(UserRole.customer)),
    session: AsyncSession = Depends(_db),
):
    txs = (await session.scalars(
        select(WalletTransaction)
        .where(WalletTransaction.user_id == user.id)
        .order_by(WalletTransaction.timestamp.desc())
    )).all()

    return [
        TransactionListOut(
            id=tx.id,
            user_email=user.email,
            amount=float(tx.amount),
            type=tx.transaction_type.value,
            timestamp=tx.timestamp,
            purchase_id=tx.purchase_id,
        )
        for tx in txs
    ]


@router.get("/purchases", response_model=list[CustomerPurchaseOut])
async def customer_purchases(
    user: User = Depends(require_role(UserRole.customer)),
    session: AsyncSession = Depends(_db),
):
    groups = (await session.scalars(
        select(PurchaseGroup)
        .where(PurchaseGroup.user_id == user.id)
        .options(selectinload(PurchaseGroup.purchases))
        .order_by(PurchaseGroup.created_at.desc())
    )).all()

    result = []
    for g in groups:
        plant = await session.get(Plant, g.plant_id)
        total_litres = float(sum(p.litres_count for p in g.purchases))
        total_price = 0.0
        for p in g.purchases:
            pr = await session.get(Price, p.price_id)
            if pr:
                total_price += float((p.litres_count * pr.unit_price).quantize(Decimal("0.01")))
        result.append(CustomerPurchaseOut(
            id=str(g.id),
            plant_name=plant.name if plant else "",
            status=g.status.value,
            total_litres=total_litres,
            total_price=total_price,
            cane_count=len(g.purchases),
            created_at=g.created_at,
        ))
    return result


@router.get("/plants", response_model=list[CustomerPlantOut])
async def customer_plants(
    _user: User = Depends(require_role(UserRole.customer)),
    session: AsyncSession = Depends(_db),
):
    plants = (await session.scalars(
        select(Plant).where(Plant.is_active == True).options(selectinload(Plant.taps))
    )).all()

    result = []
    for p in plants:
        hours = (await session.scalars(
            select(OperatingHour).where(OperatingHour.plant_id == p.id).order_by(OperatingHour.day_of_week)
        )).all()
        result.append(CustomerPlantOut(
            id=p.id,
            name=p.name,
            status=p.status.value,
            is_active=p.is_active,
            tap_count=len(p.taps),
            available_taps=sum(1 for t in p.taps if t.is_available),
            operating_hours=[
                OperatingHourOut(
                    day_of_week=h.day_of_week, opening_time=h.opening_time,
                    closing_time=h.closing_time, is_closed=h.is_closed
                )
                for h in hours
            ],
        ))
    return result
