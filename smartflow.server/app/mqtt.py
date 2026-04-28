import asyncio
import json
import logging
import ssl
from typing import Optional

import aiomqtt

from app.config import Settings
from app.db import get_sessionmaker
from app import purchase_service
from app.runtime import registry

logger = logging.getLogger(__name__)


def cmd_topic(controller_name: str) -> str:
    return f"smartflow/cmd/{controller_name}"


def ack_topic(controller_name: str) -> str:
    return f"smartflow/ack/{controller_name}"


def progress_topic(controller_name: str) -> str:
    return f"smartflow/progress/{controller_name}"


class MQTTClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: Optional[aiomqtt.Client] = None
        self._task: Optional[asyncio.Task] = None
        self._ready = asyncio.Event()

    async def start(self) -> None:
        if not self._settings.mqtt_configured:
            logger.warning("mqtt.disabled reason=not-configured")
            return
        self._task = asyncio.create_task(self._run(), name="mqtt-loop")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def publish(self, topic: str, payload: dict) -> bool:
        if not self._client or not self._ready.is_set():
            logger.error("mqtt.publish.not-connected topic=%s", topic)
            return False
        try:
            await self._client.publish(topic, json.dumps(payload).encode(), qos=1)
            logger.info("mqtt.publish topic=%s payload=%s", topic, payload)
            return True
        except Exception as exc:
            logger.exception("mqtt.publish.error topic=%s err=%s", topic, exc)
            return False

    async def _run(self) -> None:
        s = self._settings
        backoff = 1.0
        while True:
            try:
                tls_params = aiomqtt.TLSParameters(
                    ca_certs=s.AWS_IOT_CA_PATH,
                    certfile=s.AWS_IOT_CERT_PATH,
                    keyfile=s.AWS_IOT_KEY_PATH,
                    cert_reqs=ssl.CERT_REQUIRED,
                    tls_version=ssl.PROTOCOL_TLSv1_2,
                )
                async with aiomqtt.Client(
                    hostname=s.AWS_IOT_ENDPOINT,
                    port=s.AWS_IOT_PORT,
                    identifier=s.AWS_IOT_CLIENT_ID,
                    tls_params=tls_params,
                    keepalive=60,
                ) as client:
                    self._client = client
                    backoff = 1.0
                    await client.subscribe(ack_topic(s.CONTROLLER_NAME), qos=1)
                    await client.subscribe(progress_topic(s.CONTROLLER_NAME), qos=1)
                    self._ready.set()
                    logger.info(
                        "mqtt.connected endpoint=%s controller=%s",
                        s.AWS_IOT_ENDPOINT,
                        s.CONTROLLER_NAME,
                    )
                    async for message in client.messages:
                        await self._dispatch(str(message.topic), message.payload)
            except asyncio.CancelledError:
                logger.info("mqtt.stopped")
                return
            except Exception as exc:
                logger.exception("mqtt.disconnected err=%s", exc)
            finally:
                self._client = None
                self._ready.clear()
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)

    async def _dispatch(self, topic: str, raw: bytes) -> None:
        try:
            payload = json.loads(raw.decode())
        except Exception as exc:
            logger.error("mqtt.payload.malformed topic=%s err=%s raw=%r", topic, exc, raw)
            return

        raw_id = payload.get("id")
        if raw_id is None:
            logger.warning("mqtt.payload.no-id topic=%s payload=%s", topic, payload)
            return
        try:
            cane_id = int(raw_id)
        except (TypeError, ValueError):
            logger.warning("mqtt.payload.bad-id topic=%s id=%s", topic, raw_id)
            return

        controller = self._settings.CONTROLLER_NAME
        if topic == ack_topic(controller):
            await registry.resolve_ack(cane_id, payload)
        elif topic == progress_topic(controller):
            await self._handle_progress(cane_id, payload)
        else:
            logger.debug("mqtt.topic.unhandled topic=%s", topic)

    async def _handle_progress(self, cane_id: int, payload: dict) -> None:
        from decimal import Decimal

        from app.models import Purchase, PurchaseStatus

        status = payload.get("status")
        if status not in ("dispensing", "complete", "failed"):
            logger.warning("mqtt.progress.bad-status cane=%s payload=%s", cane_id, payload)
            return

        litres = Decimal(str(payload.get("litres", 0)))
        reason = payload.get("reason")

        sm = get_sessionmaker()
        async with sm() as session:
            # Peek at target + status BEFORE applying so we can decide whether
            # to send a STOP to the controller for an overshoot.
            preview = await session.get(Purchase, cane_id)
            should_stop_device = (
                status == "dispensing"
                and preview is not None
                and preview.status == PurchaseStatus.started
                and preview.litres_count > 0
                and litres >= preview.litres_count
            )
            tap_id_for_stop = preview.tap_id if preview is not None else None

            cane = await purchase_service.apply_progress(
                session, cane_id, litres=litres, status=status, reason=reason
            )
            await session.commit()

            if should_stop_device and tap_id_for_stop is not None:
                logger.info(
                    "mqtt.progress.overflow cane=%s litres=%s target=%s → STOP",
                    cane_id,
                    litres,
                    preview.litres_count,
                )
                await self.publish(
                    cmd_topic(self._settings.CONTROLLER_NAME),
                    {"id": cane_id, "tap_id": tap_id_for_stop, "action": "STOP"},
                )

            if cane is None:
                return
            frame = {
                "cane_id": cane.id,
                "tap_id": cane.tap_id,
                "litres": float(cane.litres_delivered),
                "status": cane.status.value,
                "reason": cane.reason,
            }
            await registry.push_progress(cane_id, frame)

            # If this cane was terminal and the whole group is done, cancel the
            # idle timer so it doesn't later kick the WS. The socket stays open
            # until the client closes it (there may still be canes the user
            # wants to inspect).
            if cane.status in purchase_service.TERMINAL_STATUSES:
                group = await purchase_service.load_group(session, cane.group_id)
                if group is not None and all(
                    p.status in purchase_service.TERMINAL_STATUSES for p in group.purchases
                ):
                    registry.cancel_idle(cane.group_id)


_mqtt_client: Optional[MQTTClient] = None


def get_mqtt_client() -> MQTTClient:
    assert _mqtt_client is not None, "MQTT client not initialised; call init_mqtt_client first"
    return _mqtt_client


def init_mqtt_client(settings: Settings) -> MQTTClient:
    global _mqtt_client
    _mqtt_client = MQTTClient(settings)
    return _mqtt_client
