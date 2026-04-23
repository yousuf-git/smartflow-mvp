import asyncio
import logging

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.config import get_settings
from app.mqtt import cmd_topic, get_mqtt_client
from app.schemas import DispenseRequest
from app.sessions import registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.post("/dispense")
async def dispense(body: DispenseRequest):
    settings = get_settings()

    if body.litres > settings.MAX_LITRES:
        raise HTTPException(
            status_code=400,
            detail=f"litres must be <= {settings.MAX_LITRES}",
        )

    session = await registry.create(body.litres)
    mqtt = get_mqtt_client()

    published = await mqtt.publish(
        cmd_topic(settings.DEVICE_ID),
        {"id": session.id, "action": "START", "litres": body.litres},
    )
    if not published:
        asyncio.create_task(registry.cleanup(session.id, delay=5.0))
        raise HTTPException(status_code=502, detail="mqtt_publish_failed")

    try:
        ack = await asyncio.wait_for(session.ack_future, timeout=settings.ACK_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        logger.warning("dispense.ack.timeout id=%s", session.id)
        asyncio.create_task(registry.cleanup(session.id))
        raise HTTPException(
            status_code=504,
            detail={"id": session.id, "status": "timeout"},
        )

    status = ack.get("status")
    if status == "accepted":
        return {"id": session.id, "status": "accepted"}

    if status == "rejected":
        asyncio.create_task(registry.cleanup(session.id))
        raise HTTPException(
            status_code=409,
            detail={
                "id": session.id,
                "status": "rejected",
                "reason": ack.get("reason"),
            },
        )

    asyncio.create_task(registry.cleanup(session.id))
    raise HTTPException(
        status_code=502,
        detail={"id": session.id, "status": "unknown", "ack": ack},
    )


@router.websocket("/ws/dispense/{session_id}")
async def dispense_ws(websocket: WebSocket, session_id: str):
    session = registry.get(session_id)
    if session is None:
        await websocket.close(code=4404)
        logger.warning("ws.unknown-session id=%s", session_id)
        return
    if session.terminal:
        await websocket.close(code=4410)
        logger.warning("ws.session-terminal id=%s", session_id)
        return

    await websocket.accept()
    session.ws = websocket
    logger.info("ws.connected id=%s", session_id)

    try:
        while True:
            frame = await session.progress_queue.get()
            await websocket.send_json(frame)
            if frame.get("status") in ("complete", "failed"):
                logger.info("ws.terminal id=%s status=%s", session_id, frame.get("status"))
                break
    except WebSocketDisconnect:
        logger.warning("ws.disconnect id=%s", session_id)
    except Exception as exc:
        logger.exception("ws.error id=%s err=%s", session_id, exc)
    finally:
        session.ws = None
        try:
            await websocket.close()
        except Exception:
            pass
        asyncio.create_task(registry.cleanup(session_id))


@router.get("/health")
async def health():
    return {"status": "ok"}
