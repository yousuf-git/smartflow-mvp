"""
Purchase orchestration — ties DB, wallet ledger, runtime, MQTT together.

Terminology:
- **Cane** (UI) == **Purchase** row (DB, per target). One row per cane.
- **Order** (UI) == **PurchaseGroup** row (V1.1 grouping layer).

Hold model: at group creation no wallet_transactions are written; the
`balance - hold` invariant is computed on the fly from pending/started
Purchases. When a cane acks successfully we debit the ledger for its full
price. On stop/fail with undelivered litres we credit back the unused
portion.
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
    Plant,
    Purchase,
    PurchaseGroup,
    PurchaseGroupStatus,
    PurchaseStatus,
    Tap,
)
from app.runtime import registry

logger = logging.getLogger(__name__)

CaneSpec = tuple[int, Decimal]  # (tap_id, litres)


class PurchaseError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, **extra: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.extra = extra


def _validate_canes(canes: list[CaneSpec], max_litres: Decimal) -> None:
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
    _validate_canes(canes, Decimal(str(settings.MAX_LITRES)))

    plant = (
        await session.scalars(
            select(Plant).where(Plant.id == plant_id).options(selectinload(Plant.taps))
        )
    ).one_or_none()
    if plant is None:
        raise PurchaseError("plant_not_found", f"Plant {plant_id} not found", status_code=404)

    valid_tap_ids = {t.id for t in plant.taps}
    for tap_id, _ in canes:
        if tap_id not in valid_tap_ids:
            raise PurchaseError("invalid_tap", f"Tap {tap_id} not on plant {plant_id}")

    customer = await wallet.load_customer(session, user_id)
    price, limit = await wallet.current_price_and_limit(session, customer)

    total_litres = sum((litres for _, litres in canes), Decimal("0"))
    total_price = (total_litres * price.unit_price).quantize(Decimal("0.01"))

    try:
        await wallet.assert_can_afford(session, user_id, total_price, total_litres)
    except wallet.WalletError as exc:
        await session.rollback()
        raise PurchaseError(exc.code, exc.message, status_code=402, **exc.extra) from exc

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

    cane_ids = [p.id for p in group.purchases]
    await registry.register_purchase(group.id, cane_ids)
    return group


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

async def load_group(session: AsyncSession, group_id: uuid.UUID) -> PurchaseGroup | None:
    return (
        await session.scalars(
            select(PurchaseGroup)
            .where(PurchaseGroup.id == group_id)
            .options(selectinload(PurchaseGroup.purchases))
        )
    ).one_or_none()


async def load_cane(session: AsyncSession, cane_id: int) -> Purchase | None:
    return (
        await session.scalars(
            select(Purchase)
            .where(Purchase.id == cane_id)
            .with_for_update()
        )
    ).one_or_none()


# ---------------------------------------------------------------------------
# Start / stop / cancel
# ---------------------------------------------------------------------------

def _has_active_cane_on_tap(group: PurchaseGroup, tap_id: int, exclude_id: int) -> bool:
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
    cane = await load_cane(session, cane_id)
    if cane is None:
        raise PurchaseError("cane_not_found", "Cane not found", status_code=404)

    from app.models import Price  # local import keeps models import graph shallow
    price_row = await session.get(Price, cane.price_id)
    if price_row is None:
        raise PurchaseError("price_missing", "Price snapshot missing", status_code=500)
    amount = (cane.litres_count * price_row.unit_price).quantize(Decimal("0.01"))

    await wallet.record_debit(session, cane.user_id, amount, cane.id)
    cane.status = PurchaseStatus.started
    cane.started_at = datetime.now(timezone.utc)
    return cane


async def cancel_pending_canes(
    session: AsyncSession,
    group_id: uuid.UUID,
    reason: str,
) -> tuple[PurchaseGroup, list[Purchase]]:
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
    # No wallet_transaction writes — these were never debited.

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
    """Apply a progress frame to a cane.

    `litres_delivered` is capped at `litres_count` so the DB never records
    more than was requested, even if firmware overshoots. If a `dispensing`
    frame reports `litres >= litres_count`, it is promoted to `complete` so
    the state machine converges — the caller is responsible for publishing
    STOP to the controller.
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

    # Overflow during dispensing → promote to complete.
    if status == "dispensing" and target > 0 and incoming >= target:
        status = "complete"

    if status == "dispensing":
        return cane

    undelivered = target - capped

    from app.models import Price
    price_row = await session.get(Price, cane.price_id)
    if price_row is not None and undelivered > 0 and status in ("failed", "stopped_early"):
        refund = (undelivered * price_row.unit_price).quantize(Decimal("0.01"))
        await wallet.record_credit(session, cane.user_id, refund, cane.id)

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

    group = await load_group(session, cane.group_id)
    if group is not None and all(p.status in TERMINAL_STATUSES for p in group.purchases):
        group.status = PurchaseGroupStatus.completed
    return cane
