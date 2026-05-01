"""
Plant Manager API Endpoints

This module defines endpoints for users with the 'manager' role. Managers are 
assigned to a specific plant and can monitor its health, update the status 
of its controllers and taps, and manage its operating hours.

Endpoints:
- GET /api/manager/dashboard: Metrics for the assigned plant.
- GET /api/manager/plant: Full infrastructure details for the assigned plant.
- PUT /api/manager/plant/status: Toggle plant operational status.
- PUT /api/manager/taps/{id}/status: Mark specific taps for maintenance.
- CRUD /api/manager/operating-hours: Define when the plant is open.

Connections:
- Used by: Manager Web Dashboard.
- Uses: app.models, app.schemas, app.auth, app.system_log.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_role
from app.config import Settings, get_settings
from app.db import get_sessionmaker
from app.models import (
    Controller,
    ControllerStatus,
    Customer,
    OperatingHour,
    Plant,
    PlantStatus,
    Limit,
    Price,
    Purchase,
    PurchaseGroup,
    PurchaseGroupStatus,
    PurchaseStatus,
    Tap,
    TapStatus,
    User,
    UserRole,
    WalletTransaction,
    WalletTransactionType,
)
from app.schemas import (
    AuthUser,
    ControllerOut,
    CustomerListOut,
    ManagerDashboardOut,
    OperatingHourCreateIn,
    OperatingHourOut,
    OperatingHourUpdateIn,
    OrderListOut,
    PlantDetailOut,
    ProfileUpdateIn,
    StatusUpdateIn,
    TapDetailOut,
)
from app.profile import update_profile, upload_avatar
from app.system_log import log_event
from app import wallet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/manager", tags=["manager"])


async def _db():
    """Internal dependency for manager-specific DB operations."""
    sm = get_sessionmaker()
    async with sm() as s:
        yield s


@router.put("/profile", response_model=AuthUser)
async def update_manager_profile(
    body: ProfileUpdateIn,
    manager: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    updated = await update_profile(session, manager, body)
    await log_event(session, "info", f"Manager updated own profile: {updated.email}", "manager.profile", manager.id)
    await session.commit()
    return updated


@router.post("/profile/avatar", response_model=AuthUser)
async def upload_manager_avatar(
    file: UploadFile = File(...),
    manager: User = Depends(require_role(UserRole.manager)),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(_db),
):
    updated = await upload_avatar(session, manager, file, settings)
    await log_event(session, "info", f"Manager updated own avatar: {updated.email}", "manager.profile.avatar", manager.id)
    await session.commit()
    return updated


def _require_plant(user: User) -> int:
    """Ensures the manager has an assigned plant_id."""
    if user.plant_id is None:
        raise HTTPException(status_code=403, detail="no_plant_assigned")
    return user.plant_id


@router.get("/dashboard", response_model=ManagerDashboardOut)
async def manager_dashboard(
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    """
    Aggregates performance metrics for the manager's assigned plant.
    Includes total/today revenue, volume dispensed, and active session counts.
    """
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

    # Revenue calculation: Debits linked to purchases at this plant
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

    # Net revenue today (Debits - Refunds)
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
        select(func.count(Tap.id)).where(Tap.plant_id == plant_id, Tap.deleted_at.is_(None))
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
    """
    Returns full configuration and status of the manager's assigned plant.
    Includes all child controllers, taps, and operating hour schedules.
    """
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

    controllers = [c for c in plant.controllers if c.deleted_at is None]
    taps = [t for t in plant.taps if t.deleted_at is None]

    hours = (await session.scalars(
        select(OperatingHour).where(OperatingHour.plant_id == plant.id).order_by(OperatingHour.day_of_week)
    )).all()
    return PlantDetailOut(
        id=plant.id,
        name=plant.name,
        city=plant.city,
        province=plant.province,
        area=plant.area,
        address=plant.address,
        status=plant.status.value,
        is_active=plant.is_active,
        controllers=[
            ControllerOut(id=c.id, name=c.name, com_id=c.com_id, status=c.status.value, is_active=c.is_active)
            for c in controllers
        ],
        taps=[
            TapDetailOut(id=t.id, label=t.label, status=t.status.value, is_available=t.is_available, gpio_pin_number=t.gpio_pin_number)
            for t in taps
        ],
        operating_hours=[
            OperatingHourOut(
                id=h.id, day_of_week=h.day_of_week, opening_time=h.opening_time,
                closing_time=h.closing_time, is_closed=h.is_closed
            )
            for h in hours
        ],
    )


# -- Infrastructure Control Endpoints ----------------------------------------

@router.put("/plant/status")
async def update_plant_status(
    body: StatusUpdateIn,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    """Updates the operational status of the entire plant."""
    plant_id = _require_plant(user)
    plant = await session.get(Plant, plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="plant_not_found")

    try:
        plant.status = PlantStatus(body.status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")

    if body.is_active is not None:
        plant.is_active = body.is_active

    await log_event(session, "info", f"Manager updated plant status: {plant.name} → {body.status}", "manager.plant.status", user.id)
    await session.commit()
    return {"ok": True}


@router.put("/taps/{tap_id}/status")
async def update_tap_status(
    tap_id: int,
    body: StatusUpdateIn,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    """Updates the maintenance status of a specific tap."""
    plant_id = _require_plant(user)
    tap = await session.get(Tap, tap_id)
    if tap is None or tap.deleted_at is not None or tap.plant_id != plant_id:
        raise HTTPException(status_code=404, detail="tap_not_found")

    try:
        tap.status = TapStatus(body.status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")

    await log_event(session, "info", f"Manager updated tap status: {tap.label} → {body.status}", "manager.tap.status", user.id)
    await session.commit()
    return {"ok": True}


@router.put("/controllers/{controller_id}/status")
async def update_controller_status(
    controller_id: int,
    body: StatusUpdateIn,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    """Updates the status or enables/disables a specific IoT controller."""
    plant_id = _require_plant(user)
    ctrl = await session.get(Controller, controller_id)
    if ctrl is None or ctrl.deleted_at is not None or ctrl.plant_id != plant_id:
        raise HTTPException(status_code=404, detail="controller_not_found")

    try:
        ctrl.status = ControllerStatus(body.status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")

    if body.is_active is not None:
        ctrl.is_active = body.is_active

    await log_event(session, "info", f"Manager updated controller status: {ctrl.name} → {body.status}", "manager.controller.status", user.id)
    await session.commit()
    return {"ok": True}


# -- Operating Hours Management ----------------------------------------------

@router.post("/operating-hours", status_code=201)
async def create_operating_hour(
    body: OperatingHourCreateIn,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    """Adds a new time slot to the plant's operating schedule."""
    plant_id = _require_plant(user)
    oh = OperatingHour(
        plant_id=plant_id,
        day_of_week=body.day_of_week,
        opening_time=body.opening_time,
        closing_time=body.closing_time,
        is_closed=body.is_closed,
    )
    session.add(oh)
    await session.flush()
    await log_event(session, "info", f"Manager created operating hour day={body.day_of_week}", "manager.hours.create", user.id)
    await session.commit()
    return OperatingHourOut(
        id=oh.id, day_of_week=oh.day_of_week, opening_time=oh.opening_time,
        closing_time=oh.closing_time, is_closed=oh.is_closed,
    )


@router.put("/operating-hours/{hour_id}")
async def update_operating_hour(
    hour_id: int,
    body: OperatingHourUpdateIn,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    """Modifies an existing operating hour record."""
    plant_id = _require_plant(user)
    oh = await session.get(OperatingHour, hour_id)
    if oh is None or oh.plant_id != plant_id:
        raise HTTPException(status_code=404, detail="operating_hour_not_found")

    if body.day_of_week is not None:
        oh.day_of_week = body.day_of_week
    if body.opening_time is not None:
        oh.opening_time = body.opening_time
    if body.closing_time is not None:
        oh.closing_time = body.closing_time
    if body.is_closed is not None:
        oh.is_closed = body.is_closed

    await log_event(session, "info", f"Manager updated operating hour id={hour_id}", "manager.hours.update", user.id)
    await session.commit()
    return OperatingHourOut(
        id=oh.id, day_of_week=oh.day_of_week, opening_time=oh.opening_time,
        closing_time=oh.closing_time, is_closed=oh.is_closed,
    )


@router.delete("/operating-hours/{hour_id}")
async def delete_operating_hour(
    hour_id: int,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    """Removes a time slot from the plant's schedule."""
    plant_id = _require_plant(user)
    oh = await session.get(OperatingHour, hour_id)
    if oh is None or oh.plant_id != plant_id:
        raise HTTPException(status_code=404, detail="operating_hour_not_found")

    await session.delete(oh)
    await log_event(session, "info", f"Manager deleted operating hour id={hour_id}", "manager.hours.delete", user.id)
    await session.commit()
    return {"ok": True}


# -- Read-only Data Access ---------------------------------------------------

@router.get("/orders", response_model=list[OrderListOut])
async def manager_orders(
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    """Lists water orders placed at the manager's assigned plant."""
    plant_id = _require_plant(user)
    q = (
        select(PurchaseGroup)
        .where(PurchaseGroup.plant_id == plant_id)
        .options(selectinload(PurchaseGroup.purchases))
        .order_by(PurchaseGroup.created_at.desc())
    )
    if status:
        q = q.where(PurchaseGroup.status == PurchaseGroupStatus(status))
    if date_from:
        q = q.where(PurchaseGroup.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        end = datetime(date_to.year, date_to.month, date_to.day, tzinfo=timezone.utc) + timedelta(days=1)
        q = q.where(PurchaseGroup.created_at < end)

    groups = (await session.scalars(q)).all()
    result = []
    for g in groups:
        u = await session.get(User, g.user_id)
        plant = await session.get(Plant, g.plant_id)
        total_litres = float(sum(p.litres_count for p in g.purchases))
        total_price = 0.0
        unit_price = None
        daily_litre_limit = None
        for p in g.purchases:
            pr = await session.get(Price, p.price_id)
            if pr:
                unit_price = unit_price if unit_price is not None else float(pr.unit_price)
                total_price += float((p.litres_count * pr.unit_price).quantize(Decimal("0.01")))
            limit = await session.get(Limit, p.limit_id)
            if limit and daily_litre_limit is None:
                daily_litre_limit = float(limit.daily_litre_limit)
        result.append(OrderListOut(
            id=str(g.id),
            user_email=u.email if u else "",
            plant_name=plant.name if plant else "",
            status=g.status.value,
            total_litres=total_litres,
            total_price=total_price,
            unit_price=unit_price,
            daily_litre_limit=daily_litre_limit,
            cane_count=len(g.purchases),
            created_at=g.created_at,
        ))
    return result


@router.get("/customers", response_model=list[CustomerListOut])
async def manager_customers(
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(_db),
):
    """Lists all customers who have used the manager's assigned plant."""
    plant_id = _require_plant(user)

    # Find unique user IDs who have ordered at this plant
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
            .where(
                Customer.user_id.in_(customer_user_ids),
                Customer.user.has(User.deleted_at.is_(None)),
            )
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
            avatar_url=c.user.avatar_url,
            customer_type=c.customer_type.name,
            balance=bal,
            daily_consumed=consumed,
        ))
    return result
