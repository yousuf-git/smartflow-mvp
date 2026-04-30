"""
Purchase Orchestration & Business Logic

This module acts as the central coordinator for the water dispensing workflow. 
It ties together the database models, the virtual wallet (ledger), the 
in-memory runtime state, and MQTT communication with IoT devices.

Key Concepts:
- PurchaseGroup (Order): A collection of one or more canes requested by a user.
- Purchase (Cane): A single dispensing unit with a target volume and status.
- Hold Model: Balance is "held" (checked but not debited) when an order is created. 
  Actual debit happens when a cane successfully starts dispensing.

Workflow:
1. `create_order`: Validates plant/tap availability and customer balance.
2. `record_start_attempt`: Checks rate-limits for device commands.
3. `mark_cane_started`: Debits the wallet and transitions DB state to 'started'.
4. `apply_progress`: Updates volumes from MQTT data and handles terminal states 
   (completed, failed, partial).

Connections:
- Used by: app.routes_customer (creation) and app.routes (WebSocket handlers).
- Uses: app.wallet, app.runtime, app.mqtt, app.models.
"""

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import wallet
from app.config import Settings
from app.models import (
    Controller,
    ControllerStatus,
    Plant,
    PlantStatus,
    Purchase,
    PurchaseGroup,
    PurchaseGroupStatus,
    PurchaseStatus,
    Tap,
    TapStatus,
)
from app.runtime import registry

logger = logging.getLogger(__name__)

# Type alias for (tap_id, target_litres)
CaneSpec = tuple[int, Decimal]  


class PurchaseError(Exception):
    """Custom exception for business logic violations during the purchase flow."""
    def __init__(self, code: str, message: str, status_code: int = 400, **extra: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.extra = extra


def _validate_canes(canes: list[CaneSpec], max_litres: Decimal) -> None:
    """
    Sanity checks for cane requests.
    
    Constraints:
    - 1 to 4 canes total.
    - Max 2 unique taps.
    - Max 2 canes per individual tap.
    - Volume must be > 0 and <= system maximum.
    """
    if not canes:
        raise PurchaseError("no_canes", "At least one cane is required")
    if len(canes) > 4:
        raise PurchaseError("too_many_canes", "Max 4 canes per purchase")

    by_tap: dict[int, int] = defaultdict(int)
    for tap_id, litres in canes:
        if litres <= 0:
            raise PurchaseError("invalid_litres", "Litres must be > 0")
        if litres > max_litres:
            raise PurchaseError("invalid_litres", f"Litres must be <= {max_litres}")
        by_tap[tap_id] += 1

    if len(by_tap) > 2:
        raise PurchaseError("too_many_taps", "Max 2 taps per purchase")
    for tap_id, count in by_tap.items():
        if count > 2:
            raise PurchaseError("too_many_canes_per_tap", f"Max 2 canes on tap {tap_id}")


async def create_order(
    session: AsyncSession,
    settings: Settings,
    user_id: int,
    plant_id: int,
    canes: list[CaneSpec],
) -> PurchaseGroup:
    """
    Initializes a new water purchase.
    
    Logic:
    1. Validates input constraints.
    2. Verifies Plant and Controller operational status.
    3. Verifies Tap availability (not busy, operational).
    4. Performs wallet checks (sufficient balance and daily limit).
    5. Snapshots current pricing and limits.
    6. Persists the PurchaseGroup and Purchase records.
    7. Registers the order in the in-memory 'registry' for WebSocket tracking.
    
    Returns:
        The created PurchaseGroup object.
    """
    _validate_canes(canes, Decimal(str(settings.MAX_LITRES)))

    # Load infrastructure and check health
    plant = (
        await session.scalars(
            select(Plant).where(Plant.id == plant_id).options(
                selectinload(Plant.taps),
                selectinload(Plant.controllers),
            )
        )
    ).one_or_none()
    
    if plant is None:
        raise PurchaseError("plant_not_found", f"Plant {plant_id} not found", status_code=404)
    if plant.deleted_at is not None:
        raise PurchaseError("plant_deleted", "Plant has been removed", status_code=400)
    if not plant.is_active:
        raise PurchaseError("plant_inactive", "Plant is currently inactive", status_code=400)
    if plant.status != PlantStatus.operational:
        raise PurchaseError("plant_not_operational", f"Plant is {plant.status.value}", status_code=400)

    # Ensure at least one controller is online
    active_controllers = {c.id for c in plant.controllers if c.deleted_at is None and c.is_active and c.status == ControllerStatus.operational}
    if not active_controllers:
        raise PurchaseError("no_active_controller", "No operational controller available", status_code=400)

    # Validate specific taps
    valid_taps = {t.id: t for t in plant.taps if t.deleted_at is None}
    for tap_id, _ in canes:
        tap = valid_taps.get(tap_id)
        if tap is None:
            raise PurchaseError("invalid_tap", f"Tap {tap_id} not available on plant {plant_id}")
        if tap.status != TapStatus.operational:
            raise PurchaseError("tap_maintenance", f"Tap {tap.label} is under maintenance", status_code=400)
        if not tap.is_available:
            raise PurchaseError("tap_busy", f"Tap {tap.label} is currently busy", status_code=409)
        if tap.controller_id not in active_controllers:
            raise PurchaseError("controller_inactive", f"Controller for tap {tap.label} is not operational", status_code=400)

    # Financial checks
    customer = await wallet.load_customer(session, user_id)
    price, limit = await wallet.current_price_and_limit(session, customer)

    total_litres = sum((litres for _, litres in canes), Decimal("0"))
    total_price = (total_litres * price.unit_price).quantize(Decimal("0.01"))

    try:
        await wallet.assert_can_afford(session, user_id, total_price, total_litres)
    except wallet.WalletError as exc:
        await session.rollback()
        raise PurchaseError(exc.code, exc.message, status_code=402, **exc.extra) from exc

    # Persist the order
    group = PurchaseGroup(
        user_id=user_id,
        plant_id=plant_id,
        status=PurchaseGroupStatus.active,
    )
    session.add(group)
    await session.flush()

    cane_count_by_tap: dict[int, int] = defaultdict(int)
    for tap_id, litres in canes:
        cane_count_by_tap[tap_id] += 1
        session.add(
            Purchase(
                group_id=group.id,
                price_id=price.id,
                limit_id=limit.id,
                plant_id=plant_id,
                user_id=user_id,
                tap_id=tap_id,
                litres_count=litres,
                cane_number=cane_count_by_tap[tap_id],
                status=PurchaseStatus.pending,
            )
        )
    await session.flush()

    await session.refresh(group, attribute_names=["purchases"])
    await session.commit()

    # Move to runtime state
    cane_ids = [p.id for p in group.purchases]
    await registry.register_purchase(group.id, cane_ids)
    return group


# ---------------------------------------------------------------------------
# Database Loaders (Utility)
# ---------------------------------------------------------------------------

async def load_group(session: AsyncSession, group_id: uuid.UUID) -> PurchaseGroup | None:
    """Loads a PurchaseGroup with its associated Purchases eagerly joined."""
    return (
        await session.scalars(
            select(PurchaseGroup)
            .where(PurchaseGroup.id == group_id)
            .options(selectinload(PurchaseGroup.purchases))
        )
    ).one_or_none()


async def load_cane(session: AsyncSession, cane_id: int) -> Purchase | None:
    """Loads a single Purchase record with a row-level lock for safe updates."""
    return (
        await session.scalars(
            select(Purchase)
            .where(Purchase.id == cane_id)
            .with_for_update()
        )
    ).one_or_none()


# ---------------------------------------------------------------------------
# Runtime State Transitions
# ---------------------------------------------------------------------------

def _has_active_cane_on_tap(group: PurchaseGroup, tap_id: int, exclude_id: int) -> bool:
    """Checks if another cane in the same order is already dispensing on the same tap."""
    return any(
        p.tap_id == tap_id
        and p.id != exclude_id
        and p.status == PurchaseStatus.started
        for p in group.purchases
    )


async def record_start_attempt(
    session: AsyncSession,
    settings: Settings,
    cane_id: int,
) -> Purchase:
    """
    Validates and logs an attempt to start dispensing water.
    
    Implements a sliding window rate limit for 'START' commands to prevent 
    hardware/MQTT flooding.
    """
    cane = await load_cane(session, cane_id)
    if cane is None:
        raise PurchaseError("cane_not_found", "Cane not found", status_code=404)
    if cane.status != PurchaseStatus.pending:
        raise PurchaseError(
            "cane_not_pending",
            f"Cane is {cane.status.value}",
            status_code=409,
        )

    group = await load_group(session, cane.group_id)
    if group is None or group.status != PurchaseGroupStatus.active:
        raise PurchaseError("group_inactive", "Order is not active", status_code=409)
    if _has_active_cane_on_tap(group, cane.tap_id, cane.id):
        raise PurchaseError(
            "tap_busy",
            f"Tap {cane.tap_id} is already dispensing another cane",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    window = settings.RETRY_WINDOW_SECONDS
    if (
        cane.retry_window_started_at is None
        or (now - cane.retry_window_started_at).total_seconds() > window
    ):
        cane.retry_window_started_at = now
        cane.retry_count = 1
    else:
        if cane.retry_count >= settings.RETRY_LIMIT:
            raise PurchaseError(
                "retry_limit",
                f"Max {settings.RETRY_LIMIT} start attempts per {int(window)}s reached. "
                "Cancel the cane or wait.",
                status_code=429,
            )
        cane.retry_count += 1
    return cane


async def mark_cane_started(session: AsyncSession, cane_id: int) -> Purchase:
    """
    Called when a device successfully acknowledges a START command.
    
    This is the point where the virtual wallet is officially debited.
    Transitions the cane to 'started' and marks the tap as unavailable.
    """
    cane = await load_cane(session, cane_id)
    if cane is None:
        raise PurchaseError("cane_not_found", "Cane not found", status_code=404)

    from app.models import Price 
    price_row = await session.get(Price, cane.price_id)
    if price_row is None:
        raise PurchaseError("price_missing", "Price snapshot missing", status_code=500)
    
    # Calculate exact amount based on the snapshot
    amount = (cane.litres_count * price_row.unit_price).quantize(Decimal("0.01"))

    # Financial transaction
    await wallet.record_debit(session, cane.user_id, amount, cane_id)
    
    cane.status = PurchaseStatus.started
    cane.started_at = datetime.now(timezone.utc)

    # Lock physical tap
    tap = await session.get(Tap, cane.tap_id)
    if tap is not None:
        tap.is_available = False

    return cane


async def cancel_pending_canes(
    session: AsyncSession,
    group_id: uuid.UUID,
    reason: str,
) -> tuple[PurchaseGroup, list[Purchase]]:
    """
    Cancels all 'pending' canes in an order. 
    Started canes are unaffected (must be stopped via progress/device).
    """
    group = (
        await session.scalars(
            select(PurchaseGroup).where(PurchaseGroup.id == group_id).with_for_update()
        )
    ).one_or_none()
    if group is None:
        raise PurchaseError("group_not_found", "Order not found", status_code=404)

    canes = (
        await session.scalars(
            select(Purchase).where(Purchase.group_id == group_id).with_for_update()
        )
    ).all()

    cancelled: list[Purchase] = []
    for cane in canes:
        if cane.status == PurchaseStatus.pending:
            cane.status = PurchaseStatus.cancelled
            cane.reason = reason
            cane.completed_at = datetime.now(timezone.utc)
            cancelled.append(cane)

    # Release taps if no more active canes on them
    for cane in cancelled:
        has_active_on_tap = any(
            c.tap_id == cane.tap_id and c.id != cane.id and c.status in (PurchaseStatus.pending, PurchaseStatus.started)
            for c in canes
        )
        if not has_active_on_tap:
            tap = await session.get(Tap, cane.tap_id)
            if tap is not None:
                tap.is_available = True

    # Check if the whole group is now terminal
    remaining_active = any(
        c.status in (PurchaseStatus.pending, PurchaseStatus.started) for c in canes
    )
    if not remaining_active:
        any_started = any(
            c.status
            in (
                PurchaseStatus.completed,
                PurchaseStatus.partial_completed,
                PurchaseStatus.failed,
            )
            for c in canes
        )
        group.status = (
            PurchaseGroupStatus.completed if any_started else PurchaseGroupStatus.cancelled
        )
    return group, cancelled


# List of statuses where a cane is no longer active
TERMINAL_STATUSES = (
    PurchaseStatus.completed,
    PurchaseStatus.partial_completed,
    PurchaseStatus.failed,
    PurchaseStatus.cancelled,
)


async def apply_progress(
    session: AsyncSession,
    cane_id: int,
    litres: Decimal,
    status: str,
    reason: str | None,
) -> Purchase | None:
    """
    Applies real-time flow data from MQTT to the database.
    
    Logic:
    1. Updates `litres_delivered` (capped by requested volume).
    2. Handles terminal status mapping:
       - 'complete' -> PurchaseStatus.completed
       - 'failed' -> PurchaseStatus.failed
       - 'stopped_early' -> PurchaseStatus.partial_completed (with partial refund)
    3. Issues refunds for undelivered water if the dispense ended prematurely.
    4. Releases the physical tap if no other canes are pending on it.
    5. Checks if the entire order group is now complete.
    """
    cane = await load_cane(session, cane_id)
    if cane is None:
        logger.warning("progress.cane.unknown id=%s", cane_id)
        return None
    if cane.status in TERMINAL_STATUSES:
        logger.warning("progress.cane.terminal id=%s status=%s", cane_id, cane.status)
        return cane

    target = cane.litres_count
    incoming = Decimal(str(litres))
    capped = min(incoming, target) if target > 0 else incoming
    cane.litres_delivered = capped

    # Auto-promote to complete if volume target met
    if status == "dispensing" and target > 0 and incoming >= target:
        status = "complete"

    if status == "dispensing":
        return cane

    # Processing terminal feedback from device
    undelivered = target - capped

    from app.models import Price
    price_row = await session.get(Price, cane.price_id)
    
    # Refund undelivered portion for failures or early stops
    if price_row is not None and undelivered > 0 and status in ("failed", "stopped_early"):
        refund = (undelivered * price_row.unit_price).quantize(Decimal("0.01"))
        await wallet.record_credit(session, cane.user_id, refund, cane_id)

    cane.completed_at = datetime.now(timezone.utc)
    cane.reason = reason
    
    if status == "complete":
        cane.status = PurchaseStatus.completed
    elif status == "failed":
        cane.status = PurchaseStatus.failed
    elif status == "stopped_early":
        cane.status = PurchaseStatus.partial_completed
    else:
        logger.error("progress.status.unknown id=%s status=%s", cane_id, status)
        return cane

    # Release the physical tap lock
    tap = await session.get(Tap, cane.tap_id)
    if tap is not None:
        has_other_active = False
        group_for_tap = await load_group(session, cane.group_id)
        if group_for_tap:
            has_other_active = any(
                p.tap_id == cane.tap_id and p.id != cane.id and p.status in (PurchaseStatus.pending, PurchaseStatus.started)
                for p in group_for_tap.purchases
            )
        if not has_other_active:
            tap.is_available = True

    # Complete the group if all canes are terminal
    group = await load_group(session, cane.group_id)
    if group is not None and all(p.status in TERMINAL_STATUSES for p in group.purchases):
        group.status = PurchaseGroupStatus.completed
    return cane
