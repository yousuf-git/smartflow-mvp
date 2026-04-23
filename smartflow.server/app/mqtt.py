import asyncio
import json
import logging
import ssl
from typing import Optional

import aiomqtt

from app.config import Settings
from app.sessions import registry

logger = logging.getLogger(__name__)


def cmd_topic(device_id: str) -> str:
    return f"smartflow/cmd/{device_id}"


def ack_topic(device_id: str) -> str:
    return f"smartflow/ack/{device_id}"


def progress_topic(device_id: str) -> str:
    return f"smartflow/progress/{device_id}"


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
                    await client.subscribe(ack_topic(s.DEVICE_ID), qos=1)
                    await client.subscribe(progress_topic(s.DEVICE_ID), qos=1)
                    self._ready.set()
                    logger.info(
                        "mqtt.connected endpoint=%s device=%s",
                        s.AWS_IOT_ENDPOINT,
                        s.DEVICE_ID,
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

        session_id = payload.get("id")
        if not session_id:
            logger.warning("mqtt.payload.no-id topic=%s payload=%s", topic, payload)
            return

        device_id = self._settings.DEVICE_ID
        if topic == ack_topic(device_id):
            await registry.resolve_ack(session_id, payload)
        elif topic == progress_topic(device_id):
            payload = await self._check_overage(device_id, session_id, payload)
            await registry.push_progress(session_id, payload)
        else:
            logger.debug("mqtt.topic.unhandled topic=%s", topic)

    async def _check_overage(self, device_id: str, session_id: str, payload: dict) -> dict:
        session = registry.get(session_id)
        if session is None or session.terminal:
            return payload
        received = float(payload.get("litres", 0))
        if received <= session.litres:
            return payload
        logger.info(
            "mqtt.overage id=%s received=%.2f target=%.2f — publishing STOP, treating as complete",
            session_id,
            received,
            session.litres,
        )
        published = await self.publish(
            cmd_topic(device_id),
            {"id": session_id, "action": "STOP"},
        )
        if not published:
            logger.error("mqtt.stop.publish-failed id=%s", session_id)
        return {
            **payload,
            "litres": session.litres,
            "status": "complete",
        }


_mqtt_client: Optional[MQTTClient] = None


def get_mqtt_client() -> MQTTClient:
    assert _mqtt_client is not None, "MQTT client not initialised; call init_mqtt_client first"
    return _mqtt_client


def init_mqtt_client(settings: Settings) -> MQTTClient:
    global _mqtt_client
    _mqtt_client = MQTTClient(settings)
    return _mqtt_client
