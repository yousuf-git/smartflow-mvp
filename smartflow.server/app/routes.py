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


# -- DI helpers --------------------------------------------------------------

async def db_session() -> AsyncSession:
    sm = get_sessionmaker()
    async with sm() as session:
        yield session


async def current_user_id(
    user: User = Depends(get_current_user),
) -> int:
    return user.id


# -- Response mappers --------------------------------------------------------

async def _cane_out(session: AsyncSession, p: Purchase) -> CaneOut:
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
    raise HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message, **exc.extra},
    )


# -- Health / info -----------------------------------------------------------

@router.get("/health")
async def health():
    return {"status": "ok"}


# -- Me ----------------------------------------------------------------------

@router.get("/me", response_model=MeOut)
async def me(
    user_id: int = Depends(current_user_id),
    session: AsyncSession = Depends(db_session),
):
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


# -- Catalogue ---------------------------------------------------------------

@router.get("/catalogue", response_model=CatalogueOut)
async def catalogue(session: AsyncSession = Depends(db_session)):
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


# -- Order lifecycle ---------------------------------------------------------

def _arm_idle(group_id: uuid.UUID, settings: Settings) -> None:
    """Arm the idle auto-release timer for an order.

    If no cane has started or progressed within `IDLE_RELEASE_SECONDS`, cancel
    every still-`pending` cane and push a `cancelled` frame for each. The WS
    is only closed if the order has no terminal-success canes (i.e. the whole
    order was idle from the start); otherwise the socket stays open so the
    client can inspect already-completed canes.
    """

    async def _fire(gid: uuid.UUID) -> None:
        logger.info("order.idle.fire id=%s", gid)
        sm = get_sessionmaker()
        async with sm() as session:
            try:
                group, cancelled = await purchase_service.cancel_pending_canes(
                    session, gid, reason="idle_timeout"
                )
                await session.commit()
            except PurchaseError:
                await session.rollback()
                return
            if not cancelled:
                # Nothing was pending — timer is a no-op. Leave the WS alone.
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
            # Close only if the whole order was idle from the start. If some
            # canes already finished the client may still want the socket.
            group_fully_empty = group.status == purchase_service.PurchaseGroupStatus.cancelled
        if group_fully_empty:
            await registry.close_group(gid)

    registry.arm_idle(group_id, settings.IDLE_RELEASE_SECONDS, _fire)


@router.post("/order", response_model=OrderOut, status_code=201)
async def create_order(
    body: OrderIn,
    settings: Settings = Depends(get_settings),
    user_id: int = Depends(current_user_id),
    session: AsyncSession = Depends(db_session),
):
    canes: list[tuple[int, Decimal]] = [(c.tap_id, c.litres) for c in body.canes]
    try:
        group = await purchase_service.create_order(
            session, settings, user_id, body.plant_id, canes
        )
    except PurchaseError as exc:
        _raise_purchase_error(exc)
    _arm_idle(group.id, settings)
    return await _order_out(session, group)


@router.get("/order/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(db_session),
):
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

    sm = get_sessionmaker()
    async with sm() as new_session:
        try:
            cane = await purchase_service.mark_cane_started(new_session, cane_id)
            await new_session.commit()
        except PurchaseError as exc:
            _raise_purchase_error(exc)
        cane_out = await _cane_out(new_session, cane)

    _arm_idle(order_id, settings)
    return {"status": "accepted", "cane": cane_out}


@router.post("/order/{order_id}/cane/{cane_id}/stop")
async def stop_cane(
    order_id: uuid.UUID,
    cane_id: int,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(db_session),
):
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
    await session.commit()

    cane_out = await _cane_out(session, cane)
    frame = {
        "cane_id": cane.id,
        "tap_id": cane.tap_id,
        "litres": float(cane.litres_delivered),
        "status": cane.status.value,
        "reason": cane.reason,
    }
    await registry.push_progress(cane.id, frame)

    # If this was the last active cane, stop the idle timer from firing later.
    group = await purchase_service.load_group(session, cane.group_id)
    if group is not None and all(
        p.status in purchase_service.TERMINAL_STATUSES for p in group.purchases
    ):
        registry.cancel_idle(cane.group_id)

    return {"cane": cane_out}


@router.post("/order/{order_id}/cancel")
async def cancel_order(
    order_id: uuid.UUID,
    session: AsyncSession = Depends(db_session),
):
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


# -- WebSocket ---------------------------------------------------------------

@router.websocket("/ws/order/{order_id}")
async def order_ws(websocket: WebSocket, order_id: uuid.UUID):
    rt = registry.get(order_id)
    if rt is None:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    logger.info("ws.connected order=%s", order_id)
    try:
        while True:
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
