import logging
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_role
from app.db import get_sessionmaker
from app.models import (
    Controller,
    Customer,
    OperatingHour,
    Plant,
    Price,
    Purchase,
    PurchaseGroup,
    PurchaseGroupStatus,
    PurchaseStatus,
    Tap,
    User,
    UserRole,
    WalletTransaction,
    WalletTransactionType,
)
from app.schemas import (
    ControllerOut,
    CustomerListOut,
    ManagerDashboardOut,
    OperatingHourOut,
    OrderListOut,
    PlantDetailOut,
    TapDetailOut,
)
from app import wallet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/manager", tags=["manager"])


async def _db():
    sm = get_sessionmaker()
    async with sm() as s:
        yield s


def _require_plant(user: User) -> int:
    if user.plant_id is None:
        raise HTTPException(status_code=403, detail="no_plant_assigned")
    return user.plant_id


@router.get("/dashboard", response_model=ManagerDashboardOut)
async def manager_dashboard(
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    plant_id = _require_plant(user)
    plant = await session.get(Plant, plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant_not_found")

    today = date.today()
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    total_orders = (await session.scalar(
        select(func.count(PurchaseGroup.id))
        .where(PurchaseGroup.plant_id == plant_id)
    )) or 0

    litres_row = await session.scalar(
        select(func.coalesce(func.sum(Purchase.litres_delivered), 0))
        .where(
            Purchase.plant_id == plant_id,
            Purchase.status.in_([PurchaseStatus.completed, PurchaseStatus.partial_completed]),
        )
    )
    total_litres = float(litres_row or 0)

    revenue_row = await session.scalar(
        select(func.coalesce(func.sum(WalletTransaction.amount), 0))
        .select_from(WalletTransaction)
        .join(Purchase, WalletTransaction.purchase_id == Purchase.id)
        .where(
            Purchase.plant_id == plant_id,
            WalletTransaction.transaction_type == WalletTransactionType.debit,
        )
    )
    total_revenue = float(revenue_row or 0)

    today_orders = (await session.scalar(
        select(func.count(PurchaseGroup.id))
        .where(PurchaseGroup.plant_id == plant_id, PurchaseGroup.created_at >= today_start)
    )) or 0

    today_debits = await session.scalar(
        select(func.coalesce(func.sum(WalletTransaction.amount), 0))
        .select_from(WalletTransaction)
        .join(Purchase, WalletTransaction.purchase_id == Purchase.id)
        .where(
            Purchase.plant_id == plant_id,
            WalletTransaction.transaction_type == WalletTransactionType.debit,
            WalletTransaction.timestamp >= today_start,
        )
    )
    today_credits = await session.scalar(
        select(func.coalesce(func.sum(WalletTransaction.amount), 0))
        .select_from(WalletTransaction)
        .join(Purchase, WalletTransaction.purchase_id == Purchase.id)
        .where(
            Purchase.plant_id == plant_id,
            WalletTransaction.transaction_type == WalletTransactionType.credit,
            WalletTransaction.timestamp >= today_start,
            WalletTransaction.purchase_id.isnot(None),
        )
    )
    today_revenue = float((today_debits or 0) - (today_credits or 0))

    active_sessions = (await session.scalar(
        select(func.count(PurchaseGroup.id))
        .where(
            PurchaseGroup.plant_id == plant_id,
            PurchaseGroup.status == PurchaseGroupStatus.active,
        )
    )) or 0

    tap_count = (await session.scalar(
        select(func.count(Tap.id)).where(Tap.plant_id == plant_id)
    )) or 0

    return ManagerDashboardOut(
        plant_name=plant.name,
        total_orders=total_orders,
        total_litres_dispensed=total_litres,
        total_revenue=total_revenue,
        today_orders=today_orders,
        today_revenue=today_revenue,
        active_sessions=active_sessions,
        tap_count=tap_count,
    )


@router.get("/plant", response_model=PlantDetailOut)
async def manager_plant(
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    plant_id = _require_plant(user)
    plant = (
        await session.scalars(
            select(Plant)
            .where(Plant.id == plant_id)
            .options(selectinload(Plant.controllers), selectinload(Plant.taps))
        )
    ).one_or_none()
    if not plant:
        raise HTTPException(status_code=404, detail="plant_not_found")

    ctrl = plant.controllers[0] if plant.controllers else None
    hours = (await session.scalars(
        select(OperatingHour).where(OperatingHour.plant_id == plant.id).order_by(OperatingHour.day_of_week)
    )).all()
    return PlantDetailOut(
        id=plant.id,
        name=plant.name,
        status=plant.status.value,
        is_active=plant.is_active,
        controller=ControllerOut(
            id=ctrl.id, name=ctrl.name, status=ctrl.status.value
        ) if ctrl else None,
        taps=[
            TapDetailOut(id=t.id, label=t.label, status=t.status.value, is_available=t.is_available)
            for t in plant.taps
        ],
        operating_hours=[
            OperatingHourOut(
                day_of_week=h.day_of_week, opening_time=h.opening_time,
                closing_time=h.closing_time, is_closed=h.is_closed
            )
            for h in hours
        ],
    )


@router.get("/orders", response_model=list[OrderListOut])
async def manager_orders(
    status: str | None = Query(None),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    plant_id = _require_plant(user)
    q = (
        select(PurchaseGroup)
        .where(PurchaseGroup.plant_id == plant_id)
        .options(selectinload(PurchaseGroup.purchases))
        .order_by(PurchaseGroup.created_at.desc())
    )
    if status:
        q = q.where(PurchaseGroup.status == PurchaseGroupStatus(status))

    groups = (await session.scalars(q)).all()
    result = []
    for g in groups:
        u = await session.get(User, g.user_id)
        plant = await session.get(Plant, g.plant_id)
        total_litres = float(sum(p.litres_count for p in g.purchases))
        total_price = 0.0
        for p in g.purchases:
            pr = await session.get(Price, p.price_id)
            if pr:
                total_price += float((p.litres_count * pr.unit_price).quantize(Decimal("0.01")))
        result.append(OrderListOut(
            id=str(g.id),
            user_email=u.email if u else "",
            plant_name=plant.name if plant else "",
            status=g.status.value,
            total_litres=total_litres,
            total_price=total_price,
            cane_count=len(g.purchases),
            created_at=g.created_at,
        ))
    return result


@router.get("/customers", response_model=list[CustomerListOut])
async def manager_customers(
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    plant_id = _require_plant(user)

    customer_user_ids = (
        await session.scalars(
            select(PurchaseGroup.user_id)
            .where(PurchaseGroup.plant_id == plant_id)
            .distinct()
        )
    ).all()

    if not customer_user_ids:
        return []

    customers = (
        await session.scalars(
            select(Customer)
            .where(Customer.user_id.in_(customer_user_ids))
            .options(
                selectinload(Customer.user),
                selectinload(Customer.customer_type),
            )
        )
    ).all()

    result = []
    for c in customers:
        bal = float(await wallet.balance(session, c.user_id))
        consumed = float(await wallet.daily_consumed_litres(session, c.user_id))
        result.append(CustomerListOut(
            user_id=c.user_id,
            email=c.user.email,
            first_name=c.user.first_name,
            last_name=c.user.last_name,
            customer_type=c.customer_type.name,
            balance=bal,
            daily_consumed=consumed,
        ))
    return result
