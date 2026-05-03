"""
Main API Routes & WebSocket Controllers

This module defines the primary API endpoints for the SmartFlow system, 
including the order lifecycle (create, start, stop, cancel), health checks, 
and real-time communication via WebSockets. It acts as the bridge between 
the frontend and the business logic services.

Key Endpoints:
- /api/me: Detailed user profile and wallet status.
- /api/catalogue: Available plants and taps for selection.
- /api/order: CRUD and lifecycle management for water purchases.
- /api/ws/order/{id}: Real-time progress updates for active orders.

Connections:
- Used by: Frontend application (React/Mobile).
- Uses: app.purchase_service, app.wallet, app.mqtt, app.runtime.
"""

import asyncio
import logging
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import purchase_service, wallet
from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_sessionmaker
from app.models import (
    Customer,
    CustomerType,
    Plant,
    Price,
    Purchase,
    PurchaseGroup,
    PurchaseStatus,
    Tap,
    User,
)
from app.mqtt import cmd_topic, get_mqtt_client
from app.purchase_service import PurchaseError
from app.runtime import registry
from app.schemas import (
    CaneOut,
    CatalogueOut,
    MeOut,
    OrderIn,
    OrderOut,
    PlantOut,
    TapOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


# -- Dependency Injection Helpers ---------------------------------------------

async def db_session() -> AsyncSession:
    """Dependency that provides an asynchronous database session."""
    sm = get_sessionmaker()
    async with sm() as session:
        yield session


async def current_user_id(
    user: User = Depends(get_current_user),
) -> int:
    """Dependency that extracts the current user's ID from the auth token."""
    return user.id


# -- Data Transformation / Response Mapping ----------------------------------

async def _cane_out(session: AsyncSession, p: Purchase) -> CaneOut:
    """Maps a Purchase DB model to a CaneOut Pydantic schema."""
    price_row = await session.get(Price, p.price_id)
    unit = price_row.unit_price if price_row is not None else Decimal("0")
    return CaneOut(
        id=p.id,
        tap_id=p.tap_id,
        cane_number=p.cane_number,
        litres_requested=float(p.litres_count),
        litres_delivered=float(p.litres_delivered),
        price=float((p.litres_count * unit).quantize(Decimal("0.01"))),
        status=p.status.value,
        retry_count=p.retry_count,
        reason=p.reason,
    )


async def _order_out(session: AsyncSession, g: PurchaseGroup) -> OrderOut:
    """Maps a PurchaseGroup DB model to an OrderOut Pydantic schema."""
    canes_out = [await _cane_out(session, c) for c in g.purchases]
    total_litres = sum((c.litres_requested for c in canes_out), 0.0)
    total_price = sum((c.price for c in canes_out), 0.0)
    return OrderOut(
        id=str(g.id),
        plant_id=g.plant_id,
        status=g.status.value,
        total_litres=total_litres,
        total_price=total_price,
        canes=canes_out,
    )


def _raise_purchase_error(exc: PurchaseError) -> None:
    """Converts a PurchaseError into a FastAPI HTTPException."""
    raise HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message, **exc.extra},
    )


# -- Generic Endpoints -------------------------------------------------------

# -- User Context Endpoints --------------------------------------------------

@router.get("/me", response_model=MeOut)
async def me(
    user_id: int = Depends(current_user_id),
    session: AsyncSession = Depends(db_session),
):
    """
    Returns the authenticated user's profile and current wallet snapshot.
    Used for initializing the frontend state.
    """
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    customer = (
        await session.scalars(select(Customer).where(Customer.user_id == user_id))
    ).one_or_none()
    if customer is None:
        raise HTTPException(status_code=404, detail="customer_not_found")
    ct = await session.get(CustomerType, customer.customer_type_id)
    snap = await wallet.snapshot(session, user_id)
    return MeOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        customer_type=ct.name if ct else "",
        currency=str(snap["currency"]),
        price_per_litre=float(snap["price_per_litre"]),
        balance=float(snap["balance"]),
        hold_balance=float(snap["hold_balance"]),
        daily_limit_litres=float(snap["daily_limit_litres"]),
        daily_consumed_litres=float(snap["daily_consumed_litres"]),
        daily_hold_litres=float(snap["daily_hold_litres"]),
        daily_remaining_litres=float(snap["daily_remaining_litres"]),
    )


# -- Infrastructure Catalogue ------------------------------------------------

@router.get("/catalogue", response_model=CatalogueOut)
async def catalogue(session: AsyncSession = Depends(db_session)):
    """
    Returns a list of all active plants and their taps.
    Used by customers to select where they want to dispense water.
    """
    plants = (
        await session.scalars(select(Plant).options(selectinload(Plant.taps)))
    ).all()
    return CatalogueOut(
        plants=[
            PlantOut(
                id=p.id,
                name=p.name,
                taps=[TapOut(id=t.id, label=t.label) for t in p.taps],
            )
            for p in plants
        ]
    )


# -- Order Lifecycle Logic ---------------------------------------------------

def _arm_idle_for_tap(group_id: uuid.UUID, tap_id: int, settings: Settings) -> None:
    """
    Arms a per-tap idle timeout.  When it fires, only pending canes on
    that tap are cancelled.  If the whole group becomes terminal, the
    runtime is closed.
    """
    async def _fire(gid: uuid.UUID, tid: int) -> None:
        logger.info("order.idle.fire id=%s tap=%s", gid, tid)
        sm = get_sessionmaker()
        async with sm() as session:
            try:
                group, cancelled = await purchase_service.cancel_pending_canes(
                    session, gid, reason="idle_timeout", tap_id=tid
                )
                await session.commit()
            except PurchaseError:
                await session.rollback()
                return
            if not cancelled:
                return
            for cane in cancelled:
                await registry.push_frame(
                    gid,
                    {
                        "cane_id": cane.id,
                        "tap_id": cane.tap_id,
                        "litres": float(cane.litres_delivered),
                        "status": cane.status.value,
                        "reason": cane.reason,
                    },
                )
        if group.status != purchase_service.PurchaseGroupStatus.active:
            await registry.close_group(gid)

    registry.arm_idle_for_tap(group_id, tap_id, settings.IDLE_RELEASE_SECONDS, _fire)


def _arm_idle_for_group(group_id: uuid.UUID, purchases: list, settings: Settings) -> None:
    """Arms per-tap idle timers for every tap that has idle pending canes."""
    taps_with_pending: set[int] = set()
    taps_with_started: set[int] = set()
    for p in purchases:
        if p.status == PurchaseStatus.pending:
            taps_with_pending.add(p.tap_id)
        elif p.status == PurchaseStatus.started:
            taps_with_started.add(p.tap_id)

    for tap_id in taps_with_pending:
        if tap_id not in taps_with_started:
            _arm_idle_for_tap(group_id, tap_id, settings)


@router.post("/order", response_model=OrderOut, status_code=201)
async def create_order(
    body: OrderIn,
    settings: Settings = Depends(get_settings),
    user_id: int = Depends(current_user_id),
    session: AsyncSession = Depends(db_session),
):
    """
    Creates a new water order (PurchaseGroup).
    Triggers balance validation and arms the idle timer.
    """
    canes: list[tuple[int, Decimal]] = [(c.tap_id, c.litres) for c in body.canes]
    try:
        group = await purchase_service.create_order(
            session, settings, user_id, body.plant_id, canes
        )
    except PurchaseError as exc:
        _raise_purchase_error(exc)
    _arm_idle_for_group(group.id, list(group.purchases), settings)
    return await _order_out(session, group)


@router.get("/order/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(db_session),
):
    """Retrieves current status of a specific order."""
    group = await purchase_service.load_group(session, order_id)
    if group is None:
        raise HTTPException(status_code=404, detail="order_not_found")
    return await _order_out(session, group)


@router.post("/order/{order_id}/cane/{cane_id}/start")
async def start_cane(
    order_id: uuid.UUID,
    cane_id: int,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
):
    """
    Initiates water flow for a specific cane.
    
    1. Validates the start attempt (rate limits).
    2. Publishes a 'START' command to MQTT.
    3. Waits for the IoT device to acknowledge (ACK).
    4. Upon success, marks the cane as 'started' in the DB (triggering a debit).
    """
    try:
        cane = await purchase_service.record_start_attempt(session, settings, cane_id)
    except PurchaseError as exc:
        _raise_purchase_error(exc)
    if cane.group_id != order_id:
        raise HTTPException(status_code=400, detail="cane_order_mismatch")
    await session.commit()

    mqtt = get_mqtt_client()
    ack_future = await registry.arm_ack(cane.id)

    published = await mqtt.publish(
        cmd_topic(settings.CONTROLLER_NAME),
        {
            "id": cane.id,
            "tap_id": cane.tap_id,
            "action": "START",
            "litres": float(cane.litres_count),
        },
    )
    if not published:
        raise HTTPException(status_code=502, detail={"code": "mqtt_publish_failed"})

    # Synchronous wait for asynchronous device acknowledgment
    try:
        ack = await asyncio.wait_for(ack_future, timeout=settings.ACK_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail={"code": "ack_timeout", "cane_id": cane.id},
        )

    status = ack.get("status")
    if status == "rejected":
        raise HTTPException(
            status_code=409,
            detail={"code": "rejected", "reason": ack.get("reason")},
        )
    if status != "accepted":
        raise HTTPException(
            status_code=502,
            detail={"code": "unknown_ack", "ack": ack},
        )

    # Use a fresh session for the terminal state update to avoid transaction staleness
    sm = get_sessionmaker()
    async with sm() as new_session:
        try:
            cane = await purchase_service.mark_cane_started(new_session, cane_id)
            await new_session.commit()
        except PurchaseError as exc:
            _raise_purchase_error(exc)
        cane_out = await _cane_out(new_session, cane)

    registry.cancel_idle_for_tap(order_id, cane.tap_id)
    return {"status": "accepted", "cane": cane_out}


@router.post("/order/{order_id}/cane/{cane_id}/stop")
async def stop_cane(
    order_id: uuid.UUID,
    cane_id: int,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
):
    """
    Manually stops an active dispense.
    Sends a 'STOP' command to the device and handles the partial refund logic.
    """
    cane = await purchase_service.load_cane(session, cane_id)
    if cane is None:
        raise HTTPException(status_code=404, detail="cane_not_found")
    if cane.group_id != order_id:
        raise HTTPException(status_code=400, detail="cane_order_mismatch")
    if cane.status != PurchaseStatus.started:
        raise HTTPException(
            status_code=409,
            detail={"code": "cane_not_started", "status": cane.status.value},
        )

    mqtt = get_mqtt_client()
    await mqtt.publish(
        cmd_topic(settings.CONTROLLER_NAME),
        {"id": cane.id, "tap_id": cane.tap_id, "action": "STOP"},
    )

    # Calculate and issue partial refund for undelivered water
    from datetime import datetime, timezone as tz
    price_row = await session.get(Price, cane.price_id)
    target = cane.litres_count
    delivered = min(cane.litres_delivered, target)
    undelivered = target - delivered
    
    if price_row is not None and undelivered > 0 and target > 0:
        refund = (undelivered * price_row.unit_price).quantize(Decimal("0.01"))
        await wallet.record_credit(session, cane.user_id, refund, cane.id)

    cane.status = PurchaseStatus.partial_completed
    cane.reason = "user_stopped"
    cane.completed_at = datetime.now(tz.utc)

    # Release tap if no other active canes remain on it
    group = await purchase_service.load_group(session, cane.group_id)
    if group is not None:
        has_active_on_tap = any(
            p.tap_id == cane.tap_id and p.id != cane.id
            and p.status in (PurchaseStatus.pending, PurchaseStatus.started)
            for p in group.purchases
        )
        if not has_active_on_tap:
            tap = await session.get(Tap, cane.tap_id)
            if tap is not None:
                tap.is_available = True

    await session.commit()

    cane_out = await _cane_out(session, cane)

    # Notify WebSocket about the manual stop
    frame = {
        "cane_id": cane.id,
        "tap_id": cane.tap_id,
        "litres": float(cane.litres_delivered),
        "status": cane.status.value,
        "reason": cane.reason,
    }
    await registry.push_progress(cane.id, frame)

    if group is not None:
        all_terminal = all(
            p.status in purchase_service.TERMINAL_STATUSES for p in group.purchases
        )
        if all_terminal:
            group.status = purchase_service.resolve_group_status(list(group.purchases))
            await session.commit()
            registry.cancel_idle(cane.group_id)
            await registry.close_group(cane.group_id)
        else:
            has_pending_on_tap = any(
                p.tap_id == cane.tap_id and p.status == PurchaseStatus.pending
                for p in group.purchases
            )
            if has_pending_on_tap:
                _arm_idle_for_tap(cane.group_id, cane.tap_id, settings)

    return {"cane": cane_out}


@router.post("/order/{order_id}/cancel")
async def cancel_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(db_session),
):
    """
    Cancels an entire order if it hasn't started yet.
    Releases any 'hold' balances and physical tap locks.
    """
    try:
        _, cancelled = await purchase_service.cancel_pending_canes(
            session, order_id, reason="user_cancelled"
        )
    except PurchaseError as exc:
        _raise_purchase_error(exc)
    await session.commit()

    for cane in cancelled:
        await registry.push_frame(
            order_id,
            {
                "cane_id": cane.id,
                "tap_id": cane.tap_id,
                "litres": float(cane.litres_delivered),
                "status": cane.status.value,
                "reason": cane.reason,
            },
        )
    registry.cancel_idle(order_id)
    return {"cancelled": [c.id for c in cancelled]}


# -- Real-time Progress Monitoring (WebSockets) -------------------------------

@router.websocket("/ws/order/{order_id}")
async def order_ws(websocket: WebSocket, order_id: uuid.UUID):
    """
    WebSocket endpoint that streams real-time status updates for a specific order.
    
    Updates include:
    - Flow meter readings (progress).
    - Status changes (started, completed, failed).
    - Cancellation events.
    """
    rt = registry.get(order_id)
    if rt is None:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    logger.info("ws.connected order=%s", order_id)
    try:
        while True:
            # Block until a new frame is available in the order's runtime queue
            frame = await rt.ws_queue.get()
            if frame.get("__close__"):
                break
            await websocket.send_json(frame)
    except WebSocketDisconnect:
        logger.info("ws.disconnect order=%s", order_id)
    except Exception as exc:
        logger.exception("ws.error order=%s err=%s", order_id, exc)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
