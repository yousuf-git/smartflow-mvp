"""
Customer-Specific API Endpoints

This module provides data and operations tailored for end-users (customers). 
It focuses on personal account status, consumption history, and discovering 
available water plants with real-time tap availability.

Endpoints:
- GET /api/customer/dashboard: Summary of balance, limits, and total stats.
- GET /api/customer/transactions: Personal financial ledger history.
- GET /api/customer/purchases: History of water dispense orders.
- GET /api/customer/plants: List of active plants with detailed tap status.

Connections:
- Used by: Customer Mobile/Web Dashboard and Order Flow.
- Uses: app.wallet, app.models, app.schemas, app.auth.
"""

import hashlib
import logging
import time
from decimal import Decimal

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_role
from app.config import Settings, get_settings
from app.db import get_sessionmaker
from app.models import (
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
    AuthUser,
    CustomerCaneDetailOut,
    CustomerDashboardOut,
    CustomerPlantOut,
    CustomerProfileUpdateIn,
    CustomerPurchaseOut,
    CustomerTapOut,
    CustomerTopUpIn,
    OperatingHourOut,
    TransactionListOut,
)
from app import wallet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/customer", tags=["customer"])

MAX_AVATAR_BYTES = 2 * 1024 * 1024


async def _db():
    """Internal dependency for customer-specific DB operations."""
    sm = get_sessionmaker()
    async with sm() as s:
        yield s


async def _tap_busy_ids(session: AsyncSession, plant_id: int) -> set[int]:
    """
    Identifies taps that are currently occupied by an active order.
    A tap is busy if it has a 'pending' or 'started' purchase associated 
    with it in any active purchase group.
    """
    rows = (
        await session.scalars(
            select(Purchase.tap_id)
            .join(PurchaseGroup, Purchase.group_id == PurchaseGroup.id)
            .where(
                PurchaseGroup.plant_id == plant_id,
                PurchaseGroup.status == PurchaseGroupStatus.active,
                Purchase.status.in_([PurchaseStatus.pending, PurchaseStatus.started]),
            )
            .distinct()
        )
    ).all()
    return set(rows)


@router.get("/dashboard", response_model=CustomerDashboardOut)
async def customer_dashboard(
    user: User = Depends(require_role(UserRole.customer)),
    session: AsyncSession = Depends(_db),
):
    """
    Aggregates data for the customer's main dashboard view.
    Combines wallet snapshots with total consumption and order counts.
    """
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
    """Returns the full financial history (deposits/payments) for the user."""
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
    """
    Returns a history of water orders.
    Eagerly loads purchases and calculates totals (litres and price) per order.
    """
    groups = (await session.scalars(
        select(PurchaseGroup)
        .where(PurchaseGroup.user_id == user.id)
        .options(selectinload(PurchaseGroup.purchases))
        .order_by(PurchaseGroup.created_at.desc())
    )).all()

    result = []
    for g in groups:
        plant = await session.get(Plant, g.plant_id)
        total_litres = float(sum(p.litres_delivered for p in g.purchases))
        total_price = 0.0
        cane_details: list[CustomerCaneDetailOut] = []
        for p in g.purchases:
            pr = await session.get(Price, p.price_id)
            unit = pr.unit_price if pr else Decimal("0")
            cane_price = float((p.litres_delivered * unit).quantize(Decimal("0.01")))
            total_price += cane_price
            tap = await session.get(Tap, p.tap_id)
            cane_details.append(CustomerCaneDetailOut(
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
        result.append(CustomerPurchaseOut(
            id=str(g.id),
            plant_name=plant.name if plant else "",
            status=g.status.value,
            total_litres=total_litres,
            total_price=total_price,
            cane_count=len(g.purchases),
            created_at=g.created_at,
            canes=cane_details,
        ))
    return result


@router.get("/plants", response_model=list[CustomerPlantOut])
async def customer_plants(
    _user: User = Depends(require_role(UserRole.customer)),
    session: AsyncSession = Depends(_db),
):
    """
    Discovery endpoint for active plants.
    Provides detailed status of each tap (Available vs. Busy) and operating hours.
    """
    plants = (await session.scalars(
        select(Plant)
        .where(Plant.is_active == True, Plant.deleted_at.is_(None))
        .options(selectinload(Plant.taps))
    )).all()

    result = []
    for p in plants:
        busy_ids = await _tap_busy_ids(session, p.id)
        live_taps = [t for t in p.taps if t.deleted_at is None]

        hours = (await session.scalars(
            select(OperatingHour).where(OperatingHour.plant_id == p.id).order_by(OperatingHour.day_of_week)
        )).all()

        tap_outs = [
            CustomerTapOut(
                id=t.id,
                label=t.label,
                status=t.status.value,
                is_available=t.is_available,
                is_busy=t.id in busy_ids,
            )
            for t in live_taps
        ]

        result.append(CustomerPlantOut(
            id=p.id,
            name=p.name,
            city=p.city,
            province=p.province,
            area=p.area,
            address=p.address,
            status=p.status.value,
            is_active=p.is_active,
            tap_count=len(live_taps),
            available_taps=sum(1 for t in live_taps if t.is_available and t.id not in busy_ids),
            taps=tap_outs,
            operating_hours=[
                OperatingHourOut(
                    id=h.id, day_of_week=h.day_of_week, opening_time=h.opening_time,
                    closing_time=h.closing_time, is_closed=h.is_closed
                )
                for h in hours
            ],
        ))
    return result


@router.post("/top-up", response_model=TransactionListOut)
async def customer_top_up(
    body: CustomerTopUpIn,
    user: User = Depends(require_role(UserRole.customer)),
    session: AsyncSession = Depends(_db),
):
    """Dummy wallet top-up used by the customer app."""
    tx = WalletTransaction(
        user_id=user.id,
        amount=Decimal(str(body.amount)),
        transaction_type=WalletTransactionType.credit,
    )
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return TransactionListOut(
        id=tx.id,
        user_email=user.email,
        amount=float(tx.amount),
        type=tx.transaction_type.value,
        timestamp=tx.timestamp,
        purchase_id=tx.purchase_id,
    )


@router.put("/profile", response_model=AuthUser)
async def update_customer_profile(
    body: CustomerProfileUpdateIn,
    user: User = Depends(require_role(UserRole.customer)),
    session: AsyncSession = Depends(_db),
):
    """Updates customer display name fields."""
    db_user = await session.get(User, user.id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    db_user.first_name = body.first_name.strip()
    db_user.last_name = body.last_name.strip()
    await session.commit()
    return AuthUser(
        id=db_user.id,
        email=db_user.email,
        first_name=db_user.first_name,
        last_name=db_user.last_name,
        role=db_user.role.value,
        phone=db_user.phone,
        avatar_url=db_user.avatar_url,
    )


@router.post("/profile/avatar", response_model=AuthUser)
async def upload_customer_avatar(
    file: UploadFile = File(...),
    user: User = Depends(require_role(UserRole.customer)),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(_db),
):
    """Uploads a validated avatar image to Cloudinary and stores the secure URL."""
    if not (
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    ):
        raise HTTPException(status_code=503, detail="cloudinary_not_configured")

    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(status_code=400, detail="avatar_invalid_type")

    content = await file.read(MAX_AVATAR_BYTES + 1)
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="avatar_too_large")

    timestamp = str(int(time.time()))
    folder = "smartflow/avatars"
    public_id = f"user_{user.id}_{timestamp}"
    signature_payload = f"folder={folder}&public_id={public_id}&timestamp={timestamp}{settings.CLOUDINARY_API_SECRET}"
    signature = hashlib.sha1(signature_payload.encode("utf-8")).hexdigest()

    upload_url = f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}/image/upload"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            upload_url,
            data={
                "api_key": settings.CLOUDINARY_API_KEY,
                "timestamp": timestamp,
                "folder": folder,
                "public_id": public_id,
                "signature": signature,
            },
            files={"file": (file.filename or "avatar.png", content, file.content_type)},
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="cloudinary_upload_failed")

    secure_url = response.json().get("secure_url")
    if not secure_url:
        raise HTTPException(status_code=502, detail="cloudinary_url_missing")

    db_user = await session.get(User, user.id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    db_user.avatar_url = secure_url
    await session.commit()

    return AuthUser(
        id=db_user.id,
        email=db_user.email,
        first_name=db_user.first_name,
        last_name=db_user.last_name,
        role=db_user.role.value,
        phone=db_user.phone,
        avatar_url=db_user.avatar_url,
    )
