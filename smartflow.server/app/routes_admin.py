"""
Global Administrator API Endpoints

This module defines the management interface for system-wide administrators. 
It provides comprehensive CRUD (Create, Read, Update, Delete) operations 
for every entity in the system, as well as high-level business intelligence 
dashboards and system logs.

Key Responsibilities:
- System Dashboard: Global metrics across all plants and users.
- Business Intelligence: Time-series charts for revenue and orders.
- User Management: Full lifecycle control for Admin, Manager, and Customer accounts.
- Infrastructure Management: Global registry of Plants, Controllers, and Taps.
- Financial Control: Management of Prices, Limits, and Customer Types.
- Audit & Security: Access to System Logs and the Transaction Ledger.

Connections:
- Used by: Global Admin Web Dashboard.
- Uses: app.wallet, app.models, app.schemas, app.auth, app.system_log.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import hash_password, require_role
from app.config import Settings, get_settings
from app.db import get_sessionmaker
from app.models import (
    Controller,
    ControllerStatus,
    Customer,
    CustomerType,
    Limit,
    LogLevel,
    OperatingHour,
    Plant,
    PlantStatus,
    Price,
    Purchase,
    PurchaseGroup,
    PurchaseGroupStatus,
    PurchaseStatus,
    SystemLog,
    Tap,
    TapStatus,
    User,
    UserRole,
    WalletTransaction,
    WalletTransactionType,
)
from app.schemas import (
    AdminChartData,
    AdminDashboardOut,
    AuthUser,
    ChartDataPoint,
    ControllerCreateIn,
    ControllerOut,
    ControllerUpdateIn,
    CreateUserIn,
    CustomerListOut,
    CustomerTypeCreateIn,
    CustomerTypeOut,
    CustomerTypeUpdateIn,
    LimitCreateIn,
    LimitOut,
    LimitUpdateIn,
    OperatingHourCreateIn,
    OperatingHourOut,
    OperatingHourUpdateIn,
    OrderCaneOut,
    OrderListOut,
    PlantCreateIn,
    PlantDetailOut,
    PlantUpdateIn,
    PriceCreateIn,
    PriceOut,
    PriceUpdateIn,
    ProfileUpdateIn,
    SystemLogOut,
    TapCreateIn,
    TapDetailOut,
    TapUpdateIn,
    TransactionListOut,
    UserListOut,
    UserUpdateIn,
)
from app.profile import update_profile, upload_avatar
from app.system_log import log_event
from app import wallet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])

# Terminal statuses where a purchase is considered finished
TERMINAL = {PurchaseStatus.completed, PurchaseStatus.partial_completed, PurchaseStatus.failed, PurchaseStatus.cancelled}


async def _db(session=None):
    """
    Asynchronous database session dependency for administrative routes.
    """
    sm = get_sessionmaker()
    async with sm() as s:
        yield s


@router.put("/profile", response_model=AuthUser)
async def update_admin_profile(
    body: ProfileUpdateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    updated = await update_profile(session, admin, body)
    await log_event(session, "info", f"Admin updated own profile: {updated.email}", "admin.profile", admin.id)
    await session.commit()
    return updated


@router.post("/profile/avatar", response_model=AuthUser)
async def upload_admin_avatar(
    file: UploadFile = File(...),
    admin: User = Depends(require_role(UserRole.admin)),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(_db),
):
    updated = await upload_avatar(session, admin, file, settings)
    await log_event(session, "info", f"Admin updated own avatar: {updated.email}", "admin.profile.avatar", admin.id)
    await session.commit()
    return updated


# ---------------------------------------------------------------------------
# Dashboards & Analytics
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=AdminDashboardOut)
async def admin_dashboard(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    today = date.today()
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    total_users = (await session.scalar(select(func.count(User.id)).where(User.deleted_at.is_(None)))) or 0
    total_customers = (await session.scalar(
        select(func.count(Customer.id)).select_from(Customer).join(User).where(User.deleted_at.is_(None))
    )) or 0
    total_orders = (await session.scalar(select(func.count(PurchaseGroup.id)))) or 0

    litres_row = await session.scalar(
        select(func.coalesce(func.sum(Purchase.litres_delivered), 0))
        .where(Purchase.status.in_([PurchaseStatus.completed, PurchaseStatus.partial_completed]))
    )
    total_litres = float(litres_row or 0)

    revenue_row = await session.scalar(
        select(func.coalesce(func.sum(WalletTransaction.amount), 0))
        .where(WalletTransaction.transaction_type == WalletTransactionType.debit)
    )
    total_revenue = float(revenue_row or 0)

    today_orders = (await session.scalar(
        select(func.count(PurchaseGroup.id)).where(PurchaseGroup.created_at >= today_start)
    )) or 0

    today_debits = await session.scalar(
        select(func.coalesce(func.sum(WalletTransaction.amount), 0))
        .where(WalletTransaction.transaction_type == WalletTransactionType.debit, WalletTransaction.timestamp >= today_start)
    )
    today_credits = await session.scalar(
        select(func.coalesce(func.sum(WalletTransaction.amount), 0))
        .where(
            WalletTransaction.transaction_type == WalletTransactionType.credit,
            WalletTransaction.timestamp >= today_start,
            WalletTransaction.purchase_id.isnot(None),
        )
    )
    today_revenue = float((today_debits or 0) - (today_credits or 0))

    active_sessions = (await session.scalar(
        select(func.count(PurchaseGroup.id)).where(PurchaseGroup.status == PurchaseGroupStatus.active)
    )) or 0

    return AdminDashboardOut(
        total_users=total_users,
        total_customers=total_customers,
        total_orders=total_orders,
        total_litres_dispensed=total_litres,
        total_revenue=total_revenue,
        today_orders=today_orders,
        today_revenue=today_revenue,
        active_sessions=active_sessions,
    )


@router.get("/dashboard/charts", response_model=AdminChartData)
async def admin_charts(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    today = date.today()
    days_back = 30

    revenue_chart: list[ChartDataPoint] = []
    orders_chart: list[ChartDataPoint] = []
    for i in range(days_back - 1, -1, -1):
        d = today - timedelta(days=i)
        d_start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        d_end = d_start + timedelta(days=1)

        debits = await session.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount), 0))
            .where(WalletTransaction.transaction_type == WalletTransactionType.debit, WalletTransaction.timestamp >= d_start, WalletTransaction.timestamp < d_end)
        )
        credits = await session.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount), 0))
            .where(WalletTransaction.transaction_type == WalletTransactionType.credit, WalletTransaction.timestamp >= d_start, WalletTransaction.timestamp < d_end, WalletTransaction.purchase_id.isnot(None))
        )
        revenue_chart.append(ChartDataPoint(date=d.isoformat(), value=float((debits or 0) - (credits or 0))))

        count = (await session.scalar(
            select(func.count(PurchaseGroup.id)).where(PurchaseGroup.created_at >= d_start, PurchaseGroup.created_at < d_end)
        )) or 0
        orders_chart.append(ChartDataPoint(date=d.isoformat(), value=float(count)))

    ct_rows = (await session.scalars(
        select(CustomerType).where(CustomerType.deleted_at.is_(None))
    )).all()
    customer_types = []
    for ct in ct_rows:
        count = (await session.scalar(
            select(func.count(Customer.id)).where(Customer.customer_type_id == ct.id)
        )) or 0
        customer_types.append({"name": ct.name, "value": count})

    return AdminChartData(revenue_chart=revenue_chart, orders_chart=orders_chart, customer_types=customer_types)


# ---------------------------------------------------------------------------
# Users CRUD
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[UserListOut])
async def list_users(
    role: str | None = Query(None),
    include_deleted: bool = Query(False),
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    q = select(User).order_by(User.created_at.desc())
    if not include_deleted:
        q = q.where(User.deleted_at.is_(None))
    if role:
        q = q.where(User.role == UserRole(role))

    users = (await session.scalars(q)).all()
    result = []
    for u in users:
        plant_name = None
        if u.plant_id:
            plant = await session.get(Plant, u.plant_id)
            plant_name = plant.name if plant else None
        customer_type = None
        balance = None
        if u.role == UserRole.customer:
            cust = (await session.scalars(
                select(Customer).where(Customer.user_id == u.id).options(selectinload(Customer.customer_type))
            )).one_or_none()
            if cust:
                customer_type = cust.customer_type.name
                balance = float(await wallet.balance(session, u.id))
        result.append(UserListOut(
            id=u.id, email=u.email, first_name=u.first_name, last_name=u.last_name,
            role=u.role.value, phone=u.phone, avatar_url=u.avatar_url, created_at=u.created_at, is_active=u.is_active,
            plant_name=plant_name, deleted_at=u.deleted_at, customer_type=customer_type, balance=balance,
        ))
    return result


@router.post("/users", response_model=UserListOut, status_code=201)
async def create_user(
    body: CreateUserIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    existing = (await session.scalars(select(User).where(User.email == body.email))).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="email_already_exists")

    user = User(
        email=body.email, first_name=body.first_name, last_name=body.last_name,
        password_hash=hash_password(body.password), role=UserRole(body.role),
        phone=body.phone, plant_id=body.plant_id if body.role == "manager" else None,
    )
    session.add(user)
    await session.flush()

    customer_type = None
    balance = None
    if body.role == "customer":
        ct_name = body.customer_type or "normal"
        ct = (await session.scalars(select(CustomerType).where(CustomerType.name == ct_name, CustomerType.deleted_at.is_(None)))).one_or_none()
        if ct is None:
            raise HTTPException(status_code=400, detail=f"unknown_customer_type: {ct_name}")
        customer = Customer(user_id=user.id, customer_type_id=ct.id)
        session.add(customer)
        customer_type = ct.name
        await session.flush()
        if body.initial_balance and body.initial_balance > 0:
            session.add(WalletTransaction(user_id=user.id, amount=Decimal(str(body.initial_balance)), transaction_type=WalletTransactionType.credit))
            balance = body.initial_balance

    await log_event(session, "info", f"Admin created user: {user.email} ({body.role})", "admin.users", admin.id)
    await session.commit()

    plant_name = None
    if user.plant_id:
        plant = await session.get(Plant, user.plant_id)
        plant_name = plant.name if plant else None

    return UserListOut(
        id=user.id, email=user.email, first_name=user.first_name, last_name=user.last_name,
        role=user.role.value, phone=user.phone, avatar_url=user.avatar_url, created_at=user.created_at, is_active=user.is_active,
        plant_name=plant_name, customer_type=customer_type, balance=balance,
    )


@router.put("/users/{user_id}", response_model=UserListOut)
async def update_user(
    user_id: int,
    body: UserUpdateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="user_not_found")

    if body.first_name is not None:
        user.first_name = body.first_name
    if body.last_name is not None:
        user.last_name = body.last_name
    if body.email is not None and body.email != user.email:
        dup = (await session.scalars(select(User).where(User.email == body.email))).one_or_none()
        if dup:
            raise HTTPException(status_code=409, detail="email_already_exists")
        user.email = body.email
    if body.phone is not None:
        user.phone = body.phone
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    if body.role is not None:
        user.role = UserRole(body.role)
    if body.is_active is not None:
        if user.id == admin.id and body.is_active is False:
            raise HTTPException(status_code=400, detail="cannot_disable_self")
        user.is_active = body.is_active
    if body.plant_id is not None:
        user.plant_id = body.plant_id

    if body.customer_type_id is not None and user.role == UserRole.customer:
        cust = (await session.scalars(select(Customer).where(Customer.user_id == user.id))).one_or_none()
        if cust:
            ct = await session.get(CustomerType, body.customer_type_id)
            if ct is None or ct.deleted_at is not None:
                raise HTTPException(status_code=400, detail="invalid_customer_type")
            cust.customer_type_id = body.customer_type_id

    await log_event(session, "info", f"Admin updated user: {user.email}", "admin.users", admin.id)
    await session.commit()

    plant_name = None
    if user.plant_id:
        plant = await session.get(Plant, user.plant_id)
        plant_name = plant.name if plant else None
    customer_type = None
    balance = None
    if user.role == UserRole.customer:
        cust = (await session.scalars(select(Customer).where(Customer.user_id == user.id).options(selectinload(Customer.customer_type)))).one_or_none()
        if cust:
            customer_type = cust.customer_type.name
            balance = float(await wallet.balance(session, user.id))

    return UserListOut(
        id=user.id, email=user.email, first_name=user.first_name, last_name=user.last_name,
        role=user.role.value, phone=user.phone, avatar_url=user.avatar_url, created_at=user.created_at, is_active=user.is_active,
        plant_name=plant_name, deleted_at=user.deleted_at, customer_type=customer_type, balance=balance,
    )


@router.delete("/users/{user_id}", status_code=200)
async def delete_user(
    user_id: int,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="cannot_delete_self")
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="user_not_found")
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    await log_event(session, "warning", f"Admin soft-deleted user: {user.email}", "admin.users", admin.id)
    await session.commit()
    return {"detail": "user_deleted"}


# ---------------------------------------------------------------------------
# Plants CRUD
# ---------------------------------------------------------------------------

@router.get("/plants", response_model=list[PlantDetailOut])
async def list_plants(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    plants = (await session.scalars(
        select(Plant).where(Plant.deleted_at.is_(None)).options(selectinload(Plant.controllers), selectinload(Plant.taps))
    )).all()

    result = []
    for p in plants:
        ctrls = [c for c in p.controllers if c.deleted_at is None]
        taps = [t for t in p.taps if t.deleted_at is None]
        hours = (await session.scalars(
            select(OperatingHour).where(OperatingHour.plant_id == p.id).order_by(OperatingHour.day_of_week, OperatingHour.opening_time)
        )).all()
        result.append(PlantDetailOut(
            id=p.id, name=p.name, city=p.city, province=p.province, area=p.area, address=p.address,
            status=p.status.value, is_active=p.is_active,
            controller=ControllerOut(id=ctrls[0].id, name=ctrls[0].name, com_id=ctrls[0].com_id, status=ctrls[0].status.value, is_active=ctrls[0].is_active) if ctrls else None,
            controllers=[ControllerOut(id=c.id, name=c.name, com_id=c.com_id, status=c.status.value, is_active=c.is_active) for c in ctrls],
            taps=[TapDetailOut(id=t.id, label=t.label, status=t.status.value, is_available=t.is_available, gpio_pin_number=t.gpio_pin_number) for t in taps],
            operating_hours=[OperatingHourOut(id=h.id, day_of_week=h.day_of_week, opening_time=h.opening_time, closing_time=h.closing_time, is_closed=h.is_closed) for h in hours],
        ))
    return result


@router.post("/plants", response_model=PlantDetailOut, status_code=201)
async def create_plant(
    body: PlantCreateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    plant = Plant(
        name=body.name, city=body.city, province=body.province, area=body.area, address=body.address,
        status=PlantStatus(body.status) if body.status else PlantStatus.under_review,
        is_active=body.is_active,
    )
    session.add(plant)
    await log_event(session, "info", f"Admin created plant: {body.name}", "admin.plants", admin.id)
    await session.commit()
    await session.refresh(plant)
    return PlantDetailOut(
        id=plant.id, name=plant.name, city=plant.city, province=plant.province, area=plant.area, address=plant.address,
        status=plant.status.value, is_active=plant.is_active, taps=[], controllers=[],
    )


@router.put("/plants/{plant_id}", response_model=PlantDetailOut)
async def update_plant(
    plant_id: int,
    body: PlantUpdateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    plant = await session.get(Plant, plant_id)
    if plant is None or plant.deleted_at is not None:
        raise HTTPException(status_code=404, detail="plant_not_found")

    if body.name is not None: plant.name = body.name
    if body.city is not None: plant.city = body.city
    if body.province is not None: plant.province = body.province
    if body.area is not None: plant.area = body.area
    if body.address is not None: plant.address = body.address
    if body.status is not None: plant.status = PlantStatus(body.status)
    if body.is_active is not None: plant.is_active = body.is_active

    await log_event(session, "info", f"Admin updated plant: {plant.name}", "admin.plants", admin.id)
    await session.commit()

    await session.refresh(plant, attribute_names=["controllers", "taps"])
    ctrls = [c for c in plant.controllers if c.deleted_at is None]
    taps = [t for t in plant.taps if t.deleted_at is None]
    hours = (await session.scalars(
        select(OperatingHour).where(OperatingHour.plant_id == plant.id).order_by(OperatingHour.day_of_week, OperatingHour.opening_time)
    )).all()
    return PlantDetailOut(
        id=plant.id, name=plant.name, city=plant.city, province=plant.province, area=plant.area, address=plant.address,
        status=plant.status.value, is_active=plant.is_active,
        controller=ControllerOut(id=ctrls[0].id, name=ctrls[0].name, com_id=ctrls[0].com_id, status=ctrls[0].status.value, is_active=ctrls[0].is_active) if ctrls else None,
        controllers=[ControllerOut(id=c.id, name=c.name, com_id=c.com_id, status=c.status.value, is_active=c.is_active) for c in ctrls],
        taps=[TapDetailOut(id=t.id, label=t.label, status=t.status.value, is_available=t.is_available, gpio_pin_number=t.gpio_pin_number) for t in taps],
        operating_hours=[OperatingHourOut(id=h.id, day_of_week=h.day_of_week, opening_time=h.opening_time, closing_time=h.closing_time, is_closed=h.is_closed) for h in hours],
    )


@router.delete("/plants/{plant_id}", status_code=200)
async def delete_plant(
    plant_id: int,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    plant = await session.get(Plant, plant_id)
    if plant is None or plant.deleted_at is not None:
        raise HTTPException(status_code=404, detail="plant_not_found")
    active_groups = (await session.scalar(
        select(func.count(PurchaseGroup.id)).where(PurchaseGroup.plant_id == plant_id, PurchaseGroup.status == PurchaseGroupStatus.active)
    )) or 0
    if active_groups > 0:
        raise HTTPException(status_code=409, detail="plant_has_active_orders")
    plant.deleted_at = datetime.now(timezone.utc)
    plant.is_active = False
    await log_event(session, "warning", f"Admin soft-deleted plant: {plant.name}", "admin.plants", admin.id)
    await session.commit()
    return {"detail": "plant_deleted"}


# ---------------------------------------------------------------------------
# Controllers CRUD
# ---------------------------------------------------------------------------

@router.post("/plants/{plant_id}/controllers", response_model=ControllerOut, status_code=201)
async def create_controller(
    plant_id: int,
    body: ControllerCreateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    plant = await session.get(Plant, plant_id)
    if plant is None or plant.deleted_at is not None:
        raise HTTPException(status_code=404, detail="plant_not_found")

    ctrl = Controller(
        name=body.name, com_id=body.com_id, plant_id=plant_id,
        status=ControllerStatus(body.status) if body.status else ControllerStatus.operational,
        is_active=body.is_active,
    )
    session.add(ctrl)
    await log_event(session, "info", f"Admin created controller: {body.name} on plant {plant.name}", "admin.controllers", admin.id)
    await session.commit()
    await session.refresh(ctrl)
    return ControllerOut(id=ctrl.id, name=ctrl.name, com_id=ctrl.com_id, status=ctrl.status.value, is_active=ctrl.is_active)


@router.put("/controllers/{controller_id}", response_model=ControllerOut)
async def update_controller(
    controller_id: int,
    body: ControllerUpdateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    ctrl = await session.get(Controller, controller_id)
    if ctrl is None or ctrl.deleted_at is not None:
        raise HTTPException(status_code=404, detail="controller_not_found")
    if body.name is not None: ctrl.name = body.name
    if body.com_id is not None: ctrl.com_id = body.com_id
    if body.status is not None: ctrl.status = ControllerStatus(body.status)
    if body.is_active is not None: ctrl.is_active = body.is_active
    await log_event(session, "info", f"Admin updated controller: {ctrl.name}", "admin.controllers", admin.id)
    await session.commit()
    return ControllerOut(id=ctrl.id, name=ctrl.name, com_id=ctrl.com_id, status=ctrl.status.value, is_active=ctrl.is_active)


@router.delete("/controllers/{controller_id}", status_code=200)
async def delete_controller(
    controller_id: int,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    ctrl = await session.get(Controller, controller_id)
    if ctrl is None or ctrl.deleted_at is not None:
        raise HTTPException(status_code=404, detail="controller_not_found")
    ctrl.deleted_at = datetime.now(timezone.utc)
    ctrl.is_active = False
    await log_event(session, "warning", f"Admin soft-deleted controller: {ctrl.name}", "admin.controllers", admin.id)
    await session.commit()
    return {"detail": "controller_deleted"}


# ---------------------------------------------------------------------------
# Taps CRUD
# ---------------------------------------------------------------------------

@router.post("/plants/{plant_id}/taps", response_model=TapDetailOut, status_code=201)
async def create_tap(
    plant_id: int,
    body: TapCreateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    plant = await session.get(Plant, plant_id)
    if plant is None or plant.deleted_at is not None:
        raise HTTPException(status_code=404, detail="plant_not_found")
    ctrl = await session.get(Controller, body.controller_id)
    if ctrl is None or ctrl.deleted_at is not None or ctrl.plant_id != plant_id:
        raise HTTPException(status_code=400, detail="invalid_controller")

    tap = Tap(
        controller_id=body.controller_id, plant_id=plant_id, label=body.label,
        gpio_pin_number=body.gpio_pin_number,
        status=TapStatus(body.status) if body.status else TapStatus.operational,
        is_available=True,
    )
    session.add(tap)
    await log_event(session, "info", f"Admin created tap: {body.label} on plant {plant.name}", "admin.taps", admin.id)
    await session.commit()
    await session.refresh(tap)
    return TapDetailOut(id=tap.id, label=tap.label, status=tap.status.value, is_available=tap.is_available, gpio_pin_number=tap.gpio_pin_number)


@router.put("/taps/{tap_id}", response_model=TapDetailOut)
async def update_tap(
    tap_id: int,
    body: TapUpdateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    tap = await session.get(Tap, tap_id)
    if tap is None or tap.deleted_at is not None:
        raise HTTPException(status_code=404, detail="tap_not_found")
    if body.label is not None: tap.label = body.label
    if body.gpio_pin_number is not None: tap.gpio_pin_number = body.gpio_pin_number
    if body.status is not None: tap.status = TapStatus(body.status)
    await log_event(session, "info", f"Admin updated tap: {tap.label}", "admin.taps", admin.id)
    await session.commit()
    return TapDetailOut(id=tap.id, label=tap.label, status=tap.status.value, is_available=tap.is_available, gpio_pin_number=tap.gpio_pin_number)


@router.delete("/taps/{tap_id}", status_code=200)
async def delete_tap(
    tap_id: int,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    tap = await session.get(Tap, tap_id)
    if tap is None or tap.deleted_at is not None:
        raise HTTPException(status_code=404, detail="tap_not_found")
    tap.deleted_at = datetime.now(timezone.utc)
    tap.is_available = False
    await log_event(session, "warning", f"Admin soft-deleted tap: {tap.label}", "admin.taps", admin.id)
    await session.commit()
    return {"detail": "tap_deleted"}


# ---------------------------------------------------------------------------
# Operating Hours CRUD
# ---------------------------------------------------------------------------

@router.post("/plants/{plant_id}/operating-hours", response_model=OperatingHourOut, status_code=201)
async def create_operating_hour(
    plant_id: int,
    body: OperatingHourCreateIn,
    _admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    plant = await session.get(Plant, plant_id)
    if plant is None or plant.deleted_at is not None:
        raise HTTPException(status_code=404, detail="plant_not_found")
    oh = OperatingHour(plant_id=plant_id, day_of_week=body.day_of_week, opening_time=body.opening_time, closing_time=body.closing_time, is_closed=body.is_closed)
    session.add(oh)
    await session.commit()
    await session.refresh(oh)
    return OperatingHourOut(id=oh.id, day_of_week=oh.day_of_week, opening_time=oh.opening_time, closing_time=oh.closing_time, is_closed=oh.is_closed)


@router.put("/operating-hours/{hour_id}", response_model=OperatingHourOut)
async def update_operating_hour(
    hour_id: int,
    body: OperatingHourUpdateIn,
    _admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    oh = await session.get(OperatingHour, hour_id)
    if oh is None:
        raise HTTPException(status_code=404, detail="operating_hour_not_found")
    if body.day_of_week is not None: oh.day_of_week = body.day_of_week
    if body.opening_time is not None: oh.opening_time = body.opening_time
    if body.closing_time is not None: oh.closing_time = body.closing_time
    if body.is_closed is not None: oh.is_closed = body.is_closed
    await session.commit()
    return OperatingHourOut(id=oh.id, day_of_week=oh.day_of_week, opening_time=oh.opening_time, closing_time=oh.closing_time, is_closed=oh.is_closed)


@router.delete("/operating-hours/{hour_id}", status_code=200)
async def delete_operating_hour(
    hour_id: int,
    _admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    oh = await session.get(OperatingHour, hour_id)
    if oh is None:
        raise HTTPException(status_code=404, detail="operating_hour_not_found")
    await session.delete(oh)
    await session.commit()
    return {"detail": "operating_hour_deleted"}


# ---------------------------------------------------------------------------
# Customer Types CRUD
# ---------------------------------------------------------------------------

@router.get("/customer-types", response_model=list[CustomerTypeOut])
async def list_customer_types(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    types = (await session.scalars(
        select(CustomerType).where(CustomerType.deleted_at.is_(None)).options(selectinload(CustomerType.price), selectinload(CustomerType.limit))
    )).all()
    return [
        CustomerTypeOut(
            id=ct.id,
            name=ct.name,
            description=ct.description,
            price_id=ct.price_id,
            limit_id=ct.limit_id,
            unit_price=float(ct.price.unit_price),
            daily_litre_limit=float(ct.limit.daily_litre_limit),
            created_at=ct.created_at,
            updated_at=ct.updated_at,
        )
        for ct in types
    ]


@router.post("/customer-types", response_model=CustomerTypeOut, status_code=201)
async def create_customer_type(
    body: CustomerTypeCreateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    price = await session.get(Price, body.price_id)
    if price is None or price.deleted_at is not None:
        raise HTTPException(status_code=400, detail="invalid_price")
    limit = await session.get(Limit, body.limit_id)
    if limit is None or limit.deleted_at is not None:
        raise HTTPException(status_code=400, detail="invalid_limit")
    ct = CustomerType(name=body.name, description=body.description, price_id=body.price_id, limit_id=body.limit_id)
    session.add(ct)
    await log_event(session, "info", f"Admin created customer type: {body.name}", "admin.customer_types", admin.id)
    await session.commit()
    await session.refresh(ct)
    price = await session.get(Price, ct.price_id)
    limit = await session.get(Limit, ct.limit_id)
    if price is None or limit is None:
        raise HTTPException(status_code=500, detail="customer_type_relation_missing")
    return CustomerTypeOut(
        id=ct.id,
        name=ct.name,
        description=ct.description,
        price_id=ct.price_id,
        limit_id=ct.limit_id,
        unit_price=float(price.unit_price),
        daily_litre_limit=float(limit.daily_litre_limit),
        created_at=ct.created_at,
        updated_at=ct.updated_at,
    )


@router.put("/customer-types/{ct_id}", response_model=CustomerTypeOut)
async def update_customer_type(
    ct_id: int,
    body: CustomerTypeUpdateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    ct = await session.get(CustomerType, ct_id)
    if ct is None or ct.deleted_at is not None:
        raise HTTPException(status_code=404, detail="customer_type_not_found")
    if body.name is not None: ct.name = body.name
    if body.description is not None: ct.description = body.description
    if body.price_id is not None:
        price = await session.get(Price, body.price_id)
        if price is None or price.deleted_at is not None:
            raise HTTPException(status_code=400, detail="invalid_price")
        ct.price_id = body.price_id
    if body.limit_id is not None:
        limit = await session.get(Limit, body.limit_id)
        if limit is None or limit.deleted_at is not None:
            raise HTTPException(status_code=400, detail="invalid_limit")
        ct.limit_id = body.limit_id
    await log_event(session, "info", f"Admin updated customer type: {ct.name}", "admin.customer_types", admin.id)
    await session.commit()
    await session.refresh(ct)
    price = await session.get(Price, ct.price_id)
    limit = await session.get(Limit, ct.limit_id)
    if price is None or limit is None:
        raise HTTPException(status_code=500, detail="customer_type_relation_missing")
    return CustomerTypeOut(
        id=ct.id,
        name=ct.name,
        description=ct.description,
        price_id=ct.price_id,
        limit_id=ct.limit_id,
        unit_price=float(price.unit_price),
        daily_litre_limit=float(limit.daily_litre_limit),
        created_at=ct.created_at,
        updated_at=ct.updated_at,
    )


@router.delete("/customer-types/{ct_id}", status_code=200)
async def delete_customer_type(
    ct_id: int,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    ct = await session.get(CustomerType, ct_id)
    if ct is None or ct.deleted_at is not None:
        raise HTTPException(status_code=404, detail="customer_type_not_found")
    ct.deleted_at = datetime.now(timezone.utc)
    await log_event(session, "warning", f"Admin soft-deleted customer type: {ct.name}", "admin.customer_types", admin.id)
    await session.commit()
    return {"detail": "customer_type_deleted"}


# ---------------------------------------------------------------------------
# Prices CRUD
# ---------------------------------------------------------------------------

@router.get("/prices", response_model=list[PriceOut])
async def list_prices(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    prices = (await session.scalars(
        select(Price).where(Price.deleted_at.is_(None)).order_by(Price.timestamp.desc())
    )).all()
    return [
        PriceOut(
            id=p.id,
            currency=p.currency,
            unit_price=float(p.unit_price),
            is_active=p.is_active,
            timestamp=p.timestamp,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in prices
    ]


@router.post("/prices", response_model=PriceOut, status_code=201)
async def create_price(
    body: PriceCreateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    price = Price(unit_price=Decimal(str(body.unit_price)), is_active=body.is_active, currency="Rs.")
    session.add(price)
    await log_event(session, "info", f"Admin created price: Rs. {body.unit_price}", "admin.prices", admin.id)
    await session.commit()
    await session.refresh(price)
    return PriceOut(
        id=price.id,
        currency=price.currency,
        unit_price=float(price.unit_price),
        is_active=price.is_active,
        timestamp=price.timestamp,
        created_at=price.created_at,
        updated_at=price.updated_at,
    )


@router.put("/prices/{price_id}", response_model=PriceOut)
async def update_price(
    price_id: int,
    body: PriceUpdateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    price = await session.get(Price, price_id)
    if price is None or price.deleted_at is not None:
        raise HTTPException(status_code=404, detail="price_not_found")
    if body.unit_price is not None: price.unit_price = Decimal(str(body.unit_price))
    if body.is_active is not None: price.is_active = body.is_active
    await log_event(session, "info", f"Admin updated price #{price_id}", "admin.prices", admin.id)
    await session.commit()
    await session.refresh(price)
    return PriceOut(
        id=price.id,
        currency=price.currency,
        unit_price=float(price.unit_price),
        is_active=price.is_active,
        timestamp=price.timestamp,
        created_at=price.created_at,
        updated_at=price.updated_at,
    )


# ---------------------------------------------------------------------------
# Limits CRUD
# ---------------------------------------------------------------------------

@router.get("/limits", response_model=list[LimitOut])
async def list_limits(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    limits = (await session.scalars(
        select(Limit).where(Limit.deleted_at.is_(None)).order_by(Limit.timestamp.desc())
    )).all()
    return [
        LimitOut(
            id=l.id,
            daily_litre_limit=float(l.daily_litre_limit),
            is_active=l.is_active,
            timestamp=l.timestamp,
            created_at=l.created_at,
            updated_at=l.updated_at,
        )
        for l in limits
    ]


@router.post("/limits", response_model=LimitOut, status_code=201)
async def create_limit(
    body: LimitCreateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    limit = Limit(daily_litre_limit=Decimal(str(body.daily_litre_limit)), is_active=body.is_active)
    session.add(limit)
    await log_event(session, "info", f"Admin created limit: {body.daily_litre_limit} L/day", "admin.limits", admin.id)
    await session.commit()
    await session.refresh(limit)
    return LimitOut(
        id=limit.id,
        daily_litre_limit=float(limit.daily_litre_limit),
        is_active=limit.is_active,
        timestamp=limit.timestamp,
        created_at=limit.created_at,
        updated_at=limit.updated_at,
    )


@router.put("/limits/{limit_id}", response_model=LimitOut)
async def update_limit(
    limit_id: int,
    body: LimitUpdateIn,
    admin: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    limit = await session.get(Limit, limit_id)
    if limit is None or limit.deleted_at is not None:
        raise HTTPException(status_code=404, detail="limit_not_found")
    if body.daily_litre_limit is not None: limit.daily_litre_limit = Decimal(str(body.daily_litre_limit))
    if body.is_active is not None: limit.is_active = body.is_active
    await log_event(session, "info", f"Admin updated limit #{limit_id}", "admin.limits", admin.id)
    await session.commit()
    await session.refresh(limit)
    return LimitOut(
        id=limit.id,
        daily_litre_limit=float(limit.daily_litre_limit),
        is_active=limit.is_active,
        timestamp=limit.timestamp,
        created_at=limit.created_at,
        updated_at=limit.updated_at,
    )


# ---------------------------------------------------------------------------
# System Logs
# ---------------------------------------------------------------------------

@router.get("/system-logs", response_model=list[SystemLogOut])
async def list_system_logs(
    level: str | None = Query(None),
    limit: int = Query(100, le=500),
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    q = select(SystemLog).order_by(SystemLog.created_at.desc()).limit(limit)
    if level:
        q = q.where(SystemLog.level == LogLevel(level))
    logs = (await session.scalars(q)).all()
    return [SystemLogOut(id=l.id, level=l.level.value, message=l.message, source=l.source, user_id=l.user_id, created_at=l.created_at) for l in logs]


# ---------------------------------------------------------------------------
# Customers (read-only, with soft-delete filter)
# ---------------------------------------------------------------------------

@router.get("/customers", response_model=list[CustomerListOut])
async def list_customers(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    customers = (await session.scalars(
        select(Customer).join(User).where(User.deleted_at.is_(None)).options(selectinload(Customer.user), selectinload(Customer.customer_type))
    )).all()
    result = []
    for c in customers:
        bal = float(await wallet.balance(session, c.user_id))
        consumed = float(await wallet.daily_consumed_litres(session, c.user_id))
        result.append(CustomerListOut(
            user_id=c.user_id, email=c.user.email, first_name=c.user.first_name, last_name=c.user.last_name,
            avatar_url=c.user.avatar_url,
            customer_type=c.customer_type.name, balance=bal, daily_consumed=consumed,
        ))
    return result


# ---------------------------------------------------------------------------
# Orders (with soft-delete filter)
# ---------------------------------------------------------------------------

@router.get("/orders", response_model=list[OrderListOut])
async def list_orders(
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    q = select(PurchaseGroup).options(selectinload(PurchaseGroup.purchases)).order_by(PurchaseGroup.created_at.desc())
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
        user = await session.get(User, g.user_id)
        plant = await session.get(Plant, g.plant_id)
        total_litres = float(sum(p.litres_delivered for p in g.purchases))
        total_price = 0.0
        unit_price = None
        daily_litre_limit = None
        cane_details = []
        for p in g.purchases:
            pr = await session.get(Price, p.price_id)
            unit = pr.unit_price if pr else Decimal("0")
            if pr and unit_price is None:
                unit_price = float(pr.unit_price)
            cane_price = float((p.litres_delivered * unit).quantize(Decimal("0.01")))
            total_price += cane_price
            limit = await session.get(Limit, p.limit_id)
            if limit and daily_litre_limit is None:
                daily_litre_limit = float(limit.daily_litre_limit)
            tap = await session.get(Tap, p.tap_id)
            cane_details.append(OrderCaneOut(
                id=p.id,
                tap_label=tap.label if tap else f"Tap {p.tap_id}",
                cane_number=p.cane_number,
                litres_requested=float(p.litres_count),
                litres_delivered=float(p.litres_delivered),
                price=cane_price,
                status=p.status.value,
                reason=p.reason,
                started_at=p.started_at,
                completed_at=p.completed_at,
            ))
        result.append(OrderListOut(
            id=str(g.id), user_email=user.email if user else "", plant_name=plant.name if plant else "",
            status=g.status.value, total_litres=total_litres, total_price=total_price,
            unit_price=unit_price, daily_litre_limit=daily_litre_limit,
            cane_count=len(g.purchases), created_at=g.created_at,
            canes=cane_details,
        ))
    return result


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@router.get("/transactions", response_model=list[TransactionListOut])
async def list_transactions(
    user_id: int | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    q = select(WalletTransaction).order_by(WalletTransaction.timestamp.desc())
    if user_id:
        q = q.where(WalletTransaction.user_id == user_id)
    if date_from:
        q = q.where(WalletTransaction.timestamp >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        end = datetime(date_to.year, date_to.month, date_to.day, tzinfo=timezone.utc) + timedelta(days=1)
        q = q.where(WalletTransaction.timestamp < end)
    txs = (await session.scalars(q)).all()
    result = []
    for tx in txs:
        user = await session.get(User, tx.user_id)
        result.append(TransactionListOut(
            id=tx.id, user_email=user.email if user else "", amount=float(tx.amount),
            type=tx.transaction_type.value, timestamp=tx.timestamp, purchase_id=tx.purchase_id,
        ))
    return result
