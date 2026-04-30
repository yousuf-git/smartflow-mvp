"""
In-Memory Runtime State Management

While the database is the source of truth for persistent state, this module 
manages the "liveness" of active dispensing operations. It handles 
asynchronous coordination between MQTT messages, WebSocket clients, and 
internal timers.

Key Responsibilities:
- Ack Tracking: Uses `asyncio.Future` to wait for device acknowledgments.
- WebSocket Fanout: Maintains an `asyncio.Queue` per active order to stream progress.
- Idle Management: Tracks inactivity and triggers automatic cleanup/disconnection.

Connections:
- Used by: app.mqtt (to resolve ACKs), app.routes (to consume WebSocket queues), 
  and app.purchase_service (to register new orders).
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)


@dataclass
class CaneRuntime:
    """Runtime state for an individual cane within an active order."""
    ack_future: asyncio.Future | None = None


@dataclass
class GroupRuntime:
    """
    Runtime state for an entire order (PurchaseGroup).
    
    Attributes:
        group_id: Unique identifier for the order.
        canes: Map of cane_id to its runtime state.
        ws_queue: Queue for pushing real-time frames to the client's WebSocket.
        idle_task: Background task that monitors for order inactivity.
        closed: Flag indicating if the runtime session is finished.
    """
    group_id: uuid.UUID
    canes: dict[int, CaneRuntime] = field(default_factory=dict)
    ws_queue: asyncio.Queue[dict[str, Any]] = field(default_factory=asyncio.Queue)
    idle_task: asyncio.Task[None] | None = None
    closed: bool = False


class Registry:
    """
    Central registry for all active GroupRuntime instances.
    Provides thread-safe access to in-memory state.
    """
    def __init__(self) -> None:
        self._groups: dict[uuid.UUID, GroupRuntime] = {}
        self._cane_index: dict[int, uuid.UUID] = {}
        self._lock = asyncio.Lock()

    async def register_purchase(self, group_id: uuid.UUID, cane_ids: list[int]) -> GroupRuntime:
        """
        Registers a new order and its canes in the registry.
        Called by purchase_service.create_order.
        """
        async with self._lock:
            rt = GroupRuntime(group_id=group_id)
            for cid in cane_ids:
                rt.canes[cid] = CaneRuntime()
                self._cane_index[cid] = group_id
            self._groups[group_id] = rt
            return rt

    def get(self, group_id: uuid.UUID) -> GroupRuntime | None:
        """Retrieves runtime state for a specific order ID."""
        return self._groups.get(group_id)

    def get_by_cane(self, cane_id: int) -> tuple[GroupRuntime, CaneRuntime] | None:
        """Helper to find an order's runtime state using a specific cane ID."""
        gid = self._cane_index.get(cane_id)
        if gid is None:
            return None
        rt = self._groups.get(gid)
        if rt is None:
            return None
        cane = rt.canes.get(cane_id)
        if cane is None:
            return None
        return rt, cane

    async def arm_ack(self, cane_id: int) -> asyncio.Future:
        """
        Initializes a future that will be resolved when the device sends an ACK 
        for this cane.
        """
        pair = self.get_by_cane(cane_id)
        if pair is None:
            raise KeyError(f"cane {cane_id} not in runtime")
        _, cane = pair
        loop = asyncio.get_running_loop()
        cane.ack_future = loop.create_future()
        return cane.ack_future

    async def resolve_ack(self, cane_id: int, payload: dict) -> None:
        """
        Resolves a pending ACK future with the payload from an MQTT message.
        Called by app.mqtt.
        """
        pair = self.get_by_cane(cane_id)
        if pair is None:
            logger.warning("ack.unknown cane=%s", cane_id)
            return
        _, cane = pair
        if cane.ack_future and not cane.ack_future.done():
            cane.ack_future.set_result(payload)
        else:
            logger.warning("ack.no-listener cane=%s", cane_id)

    async def push_progress(self, cane_id: int, frame: dict) -> None:
        """
        Pushes a progress update frame into the order's WebSocket queue.
        Called by app.mqtt during active dispensing.
        """
        pair = self.get_by_cane(cane_id)
        if pair is None:
            logger.warning("progress.unknown cane=%s", cane_id)
            return
        rt, _ = pair
        if rt.closed:
            return
        await rt.ws_queue.put(frame)

    async def push_frame(self, group_id: uuid.UUID, frame: dict) -> None:
        """Generic method to push any data frame to an order's WebSocket."""
        rt = self._groups.get(group_id)
        if rt is None or rt.closed:
            return
        await rt.ws_queue.put(frame)

    async def close_group(self, group_id: uuid.UUID) -> None:
        """
        Cleans up runtime state for an order.
        Removes it from the registry and notifies any connected WebSocket listeners.
        """
        async with self._lock:
            rt = self._groups.pop(group_id, None)
            if rt is None:
                return
            rt.closed = True
            for cid in list(rt.canes.keys()):
                self._cane_index.pop(cid, None)
            if rt.idle_task and not rt.idle_task.done():
                rt.idle_task.cancel()
            
            # Special frame to signal WebSocket closure
            await rt.ws_queue.put({"__close__": True})
            logger.info("runtime.close group=%s", group_id)

    def arm_idle(
        self,
        group_id: uuid.UUID,
        delay: float,
        on_fire: Callable[[uuid.UUID], Awaitable[None]],
    ) -> None:
        """
        Sets a countdown timer for order inactivity. 
        If it reaches zero, the `on_fire` callback is executed.
        """
        rt = self._groups.get(group_id)
        if rt is None:
            return
        if rt.idle_task and not rt.idle_task.done():
            rt.idle_task.cancel()

        async def _run() -> None:
            try:
                await asyncio.sleep(delay)
                await on_fire(group_id)
            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.exception("runtime.idle.error group=%s err=%s", group_id, exc)

        rt.idle_task = asyncio.create_task(_run(), name=f"idle-{group_id}")

    def cancel_idle(self, group_id: uuid.UUID) -> None:
        """Stops the idle timer for an order (e.g., when activity is detected)."""
        rt = self._groups.get(group_id)
        if rt is None:
            return
        if rt.idle_task and not rt.idle_task.done():
            rt.idle_task.cancel()


# Global singleton registry instance.
registry = Registry()
