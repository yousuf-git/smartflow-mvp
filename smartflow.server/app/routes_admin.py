import logging
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import hash_password, require_role
from app.db import get_sessionmaker
from app.models import (
    Controller,
    Customer,
    CustomerType,
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
    AdminDashboardOut,
    ControllerOut,
    CreateUserIn,
    CustomerListOut,
    OperatingHourOut,
    OrderListOut,
    PlantDetailOut,
    TapDetailOut,
    TransactionListOut,
    UserListOut,
)
from app import wallet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])

TERMINAL = {PurchaseStatus.completed, PurchaseStatus.partial_completed, PurchaseStatus.failed, PurchaseStatus.cancelled}


async def _db(session=None):
    sm = get_sessionmaker()
    async with sm() as s:
        yield s


@router.get("/dashboard", response_model=AdminDashboardOut)
async def admin_dashboard(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    today = date.today()
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    total_users = (await session.scalar(select(func.count(User.id)))) or 0
    total_customers = (await session.scalar(select(func.count(Customer.id)))) or 0
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
        select(func.count(PurchaseGroup.id))
        .where(PurchaseGroup.created_at >= today_start)
    )) or 0

    today_debits = await session.scalar(
        select(func.coalesce(func.sum(WalletTransaction.amount), 0))
        .where(
            WalletTransaction.transaction_type == WalletTransactionType.debit,
            WalletTransaction.timestamp >= today_start,
        )
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
        select(func.count(PurchaseGroup.id))
        .where(PurchaseGroup.status == PurchaseGroupStatus.active)
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


@router.get("/users", response_model=list[UserListOut])
async def list_users(
    role: str | None = Query(None),
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    q = select(User).order_by(User.created_at.desc())
    if role:
        q = q.where(User.role == UserRole(role))

    users = (await session.scalars(q)).all()
    result = []
    for u in users:
        plant_name = None
        if u.plant_id:
            plant = await session.get(Plant, u.plant_id)
            plant_name = plant.name if plant else None
        result.append(UserListOut(
            id=u.id,
            email=u.email,
            first_name=u.first_name,
            last_name=u.last_name,
            role=u.role.value,
            created_at=u.created_at,
            is_active=u.is_active,
            plant_name=plant_name,
        ))
    return result


@router.post("/users", response_model=UserListOut, status_code=201)
async def create_user(
    body: CreateUserIn,
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    existing = (
        await session.scalars(select(User).where(User.email == body.email))
    ).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="email_already_exists")

    user = User(
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        password_hash=hash_password(body.password),
        role=UserRole(body.role),
        plant_id=body.plant_id if body.role == "manager" else None,
    )
    session.add(user)
    await session.flush()

    if body.role == "customer":
        ct_name = body.customer_type or "normal"
        ct = (
            await session.scalars(select(CustomerType).where(CustomerType.name == ct_name))
        ).one_or_none()
        if ct is None:
            raise HTTPException(status_code=400, detail=f"unknown_customer_type: {ct_name}")

        customer = Customer(user_id=user.id, customer_type_id=ct.id)
        session.add(customer)
        await session.flush()

        if body.initial_balance and body.initial_balance > 0:
            session.add(WalletTransaction(
                user_id=user.id,
                amount=Decimal(str(body.initial_balance)),
                transaction_type=WalletTransactionType.credit,
            ))

    await session.commit()

    plant_name = None
    if user.plant_id:
        plant = await session.get(Plant, user.plant_id)
        plant_name = plant.name if plant else None

    return UserListOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role.value,
        created_at=user.created_at,
        is_active=user.is_active,
        plant_name=plant_name,
    )


@router.get("/customers", response_model=list[CustomerListOut])
async def list_customers(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    customers = (
        await session.scalars(
            select(Customer).options(
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


@router.get("/orders", response_model=list[OrderListOut])
async def list_orders(
    status: str | None = Query(None),
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    q = (
        select(PurchaseGroup)
        .options(selectinload(PurchaseGroup.purchases))
        .order_by(PurchaseGroup.created_at.desc())
    )
    if status:
        q = q.where(PurchaseGroup.status == PurchaseGroupStatus(status))

    groups = (await session.scalars(q)).all()
    result = []
    for g in groups:
        user = await session.get(User, g.user_id)
        plant = await session.get(Plant, g.plant_id)
        total_litres = float(sum(p.litres_count for p in g.purchases))
        total_price = 0.0
        for p in g.purchases:
            pr = await session.get(Price, p.price_id)
            if pr:
                total_price += float((p.litres_count * pr.unit_price).quantize(Decimal("0.01")))
        result.append(OrderListOut(
            id=str(g.id),
            user_email=user.email if user else "",
            plant_name=plant.name if plant else "",
            status=g.status.value,
            total_litres=total_litres,
            total_price=total_price,
            cane_count=len(g.purchases),
            created_at=g.created_at,
        ))
    return result


@router.get("/plants", response_model=list[PlantDetailOut])
async def list_plants(
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    plants = (
        await session.scalars(
            select(Plant).options(
                selectinload(Plant.controllers),
                selectinload(Plant.taps),
            )
        )
    ).all()

    result = []
    for p in plants:
        ctrl = p.controllers[0] if p.controllers else None
        hours = (await session.scalars(
            select(OperatingHour).where(OperatingHour.plant_id == p.id).order_by(OperatingHour.day_of_week)
        )).all()
        result.append(PlantDetailOut(
            id=p.id,
            name=p.name,
            status=p.status.value,
            is_active=p.is_active,
            controller=ControllerOut(
                id=ctrl.id, name=ctrl.name, status=ctrl.status.value
            ) if ctrl else None,
            taps=[
                TapDetailOut(
                    id=t.id, label=t.label, status=t.status.value, is_available=t.is_available
                )
                for t in p.taps
            ],
            operating_hours=[
                OperatingHourOut(
                    day_of_week=h.day_of_week, opening_time=h.opening_time,
                    closing_time=h.closing_time, is_closed=h.is_closed
                )
                for h in hours
            ],
        ))
    return result


@router.get("/transactions", response_model=list[TransactionListOut])
async def list_transactions(
    user_id: int | None = Query(None),
    _user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(_db),
):
    q = select(WalletTransaction).order_by(WalletTransaction.timestamp.desc())
    if user_id:
        q = q.where(WalletTransaction.user_id == user_id)

    txs = (await session.scalars(q)).all()
    result = []
    for tx in txs:
        user = await session.get(User, tx.user_id)
        result.append(TransactionListOut(
            id=tx.id,
            user_email=user.email if user else "",
            amount=float(tx.amount),
            type=tx.transaction_type.value,
            timestamp=tx.timestamp,
            purchase_id=tx.purchase_id,
        ))
    return result
