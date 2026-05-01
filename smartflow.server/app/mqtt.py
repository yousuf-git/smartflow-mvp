"""
AWS IoT MQTT Integration & Device Communication

This module manages the asynchronous MQTT client used to communicate with 
physical dispensing hardware (e.g., ESP32 controllers). It handles the 
secure TLS connection to AWS IoT Core and implements a pub/sub pattern for 
command execution and real-time status updates.

Topics:
- Command: `smartflow/cmd/{controller}` - Server sends START/STOP commands.
- Ack: `smartflow/ack/{controller}` - Device confirms receipt of a command.
- Progress: `smartflow/progress/{controller}` - Device sends flow meter readings.

Connections:
- Used by: app.main (lifespan), app.purchase_service (to send commands).
- Uses: app.runtime (Registry) to resolve ACKs and push progress to WebSockets.
"""

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
    """Returns the MQTT topic for sending commands to a specific controller."""
    return f"smartflow/cmd/{controller_name}"


def ack_topic(controller_name: str) -> str:
    """Returns the MQTT topic for receiving command acknowledgments."""
    return f"smartflow/ack/{controller_name}"


def progress_topic(controller_name: str) -> str:
    """Returns the MQTT topic for receiving real-time dispensing progress."""
    return f"smartflow/progress/{controller_name}"


class MQTTClient:
    """
    Encapsulates the aiomqtt client and its lifecycle.
    
    Handles automatic reconnection with exponential backoff and message 
    dispatching to the rest of the application.
    """
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: Optional[aiomqtt.Client] = None
        self._task: Optional[asyncio.Task] = None
        self._ready = asyncio.Event()

    @property
    def connected(self) -> bool:
        return self._ready.is_set()

    async def start(self) -> None:
        """Starts the MQTT background loop task."""
        if not self._settings.mqtt_configured:
            logger.warning("mqtt.disabled reason=not-configured")
            return
        self._task = asyncio.create_task(self._run(), name="mqtt-loop")

    async def stop(self) -> None:
        """Gracefully stops the MQTT client and cancels the loop task."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def publish(self, topic: str, payload: dict) -> bool:
        """
        Publishes a JSON payload to a specific MQTT topic.
        
        Returns:
            True if published successfully, False otherwise.
        """
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
        """
        The core MQTT loop.
        Maintains the TLS connection and listens for incoming messages.
        """
        s = self._settings
        backoff = 2.0
        loop = asyncio.get_event_loop()
        while True:
            connected_at = loop.time()
            try:
                ssl_ctx = ssl.create_default_context(cafile=s.AWS_IOT_CA_PATH)
                ssl_ctx.load_cert_chain(s.AWS_IOT_CERT_PATH, s.AWS_IOT_KEY_PATH)
                if s.AWS_IOT_PORT == 443:
                    ssl_ctx.set_alpn_protocols(["x-amzn-mqtt-ca"])
                async with aiomqtt.Client(
                    hostname=s.AWS_IOT_ENDPOINT,
                    port=s.AWS_IOT_PORT,
                    identifier=s.AWS_IOT_CLIENT_ID,
                    tls_context=ssl_ctx,
                    keepalive=1200,
                ) as client:
                    self._client = client
                    connected_at = loop.time()

                    ack = ack_topic(s.CONTROLLER_NAME)
                    prg = progress_topic(s.CONTROLLER_NAME)
                    await client.subscribe(ack, qos=1)
                    await client.subscribe(prg, qos=1)

                    self._ready.set()
                    logger.info(
                        "mqtt.connected endpoint=%s port=%s controller=%s",
                        s.AWS_IOT_ENDPOINT, s.AWS_IOT_PORT, s.CONTROLLER_NAME,
                    )

                    async for message in client.messages:
                        await self._dispatch(str(message.topic), message.payload)
            except asyncio.CancelledError:
                logger.info("mqtt.stopped")
                return
            except Exception as exc:
                uptime = loop.time() - connected_at
                logger.error("mqtt.disconnected err=%s uptime=%.1fs backoff=%.1fs", exc, uptime, backoff)
                if uptime > 30:
                    backoff = 2.0
            finally:
                self._client = None
                self._ready.clear()

            logger.info("mqtt.reconnecting in=%.1fs", backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60.0)

    async def _dispatch(self, topic: str, raw: bytes) -> None:
        """
        Routes incoming MQTT messages based on their topic.
        
        Logic:
        - ACK: Resolves pending futures in the Registry (app.runtime).
        - Progress: Updates the DB and pushes to WebSockets.
        """
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
        """
        Handles real-time flow data from the device.
        
        Logic:
        1. Validates the incoming status.
        2. Applies the progress to the database via purchase_service.
        3. If the device overshoots the target volume, sends a STOP command.
        4. Fans out the update to the connected WebSocket client.
        5. Manages idle timers for the order.
        """
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
            # Overshoot protection: check if we should tell the device to stop early.
            preview = await session.get(Purchase, cane_id)
            should_stop_device = (
                status == "dispensing"
                and preview is not None
                and preview.status == PurchaseStatus.started
                and preview.litres_count > 0
                and litres >= preview.litres_count
            )
            tap_id_for_stop = preview.tap_id if preview is not None else None

            # Update database state
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
            
            # Fan out to WebSocket clients via Registry
            frame = {
                "cane_id": cane.id,
                "tap_id": cane.tap_id,
                "litres": float(cane.litres_delivered),
                "status": cane.status.value,
                "reason": cane.reason,
            }
            await registry.push_progress(cane_id, frame)

            # Cleanup: if the entire order (group) is finished, stop the idle disconnect timer.
            if cane.status in purchase_service.TERMINAL_STATUSES:
                group = await purchase_service.load_group(session, cane.group_id)
                if group is not None and all(
                    p.status in purchase_service.TERMINAL_STATUSES for p in group.purchases
                ):
                    registry.cancel_idle(cane.group_id)


# Global singleton instance of the MQTT client.
_mqtt_client: Optional[MQTTClient] = None


def get_mqtt_client() -> MQTTClient:
    """Returns the initialized global MQTT client."""
    assert _mqtt_client is not None, "MQTT client not initialised; call init_mqtt_client first"
    return _mqtt_client


def init_mqtt_client(settings: Settings) -> MQTTClient:
    """Initializes the global MQTT client singleton."""
    global _mqtt_client
    _mqtt_client = MQTTClient(settings)
    return _mqtt_client
