"""
In-memory runtime for active orders (PurchaseGroups).

DB is source of truth for state. This module owns *liveness*: ack futures
per cane, WebSocket fanout queue per group, idle-release timer per group.

Keys:
- `group_id`: uuid.UUID  (PurchaseGroup.id)
- `cane_id`: int         (Purchase.id)
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)


@dataclass
class CaneRuntime:
    ack_future: asyncio.Future | None = None


@dataclass
class GroupRuntime:
    group_id: uuid.UUID
    canes: dict[int, CaneRuntime] = field(default_factory=dict)
    ws_queue: asyncio.Queue[dict[str, Any]] = field(default_factory=asyncio.Queue)
    idle_task: asyncio.Task[None] | None = None
    closed: bool = False


class Registry:
    def __init__(self) -> None:
        self._groups: dict[uuid.UUID, GroupRuntime] = {}
        self._cane_index: dict[int, uuid.UUID] = {}
        self._lock = asyncio.Lock()

    async def register_purchase(self, group_id: uuid.UUID, cane_ids: list[int]) -> GroupRuntime:
        async with self._lock:
            rt = GroupRuntime(group_id=group_id)
            for cid in cane_ids:
                rt.canes[cid] = CaneRuntime()
                self._cane_index[cid] = group_id
            self._groups[group_id] = rt
            return rt

    def get(self, group_id: uuid.UUID) -> GroupRuntime | None:
        return self._groups.get(group_id)

    def get_by_cane(self, cane_id: int) -> tuple[GroupRuntime, CaneRuntime] | None:
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
        pair = self.get_by_cane(cane_id)
        if pair is None:
            raise KeyError(f"cane {cane_id} not in runtime")
        _, cane = pair
        loop = asyncio.get_running_loop()
        cane.ack_future = loop.create_future()
        return cane.ack_future

    async def resolve_ack(self, cane_id: int, payload: dict) -> None:
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
        pair = self.get_by_cane(cane_id)
        if pair is None:
            logger.warning("progress.unknown cane=%s", cane_id)
            return
        rt, _ = pair
        if rt.closed:
            return
        await rt.ws_queue.put(frame)

    async def push_frame(self, group_id: uuid.UUID, frame: dict) -> None:
        rt = self._groups.get(group_id)
        if rt is None or rt.closed:
            return
        await rt.ws_queue.put(frame)

    async def close_group(self, group_id: uuid.UUID) -> None:
        async with self._lock:
            rt = self._groups.pop(group_id, None)
            if rt is None:
                return
            rt.closed = True
            for cid in list(rt.canes.keys()):
                self._cane_index.pop(cid, None)
            if rt.idle_task and not rt.idle_task.done():
                rt.idle_task.cancel()
            await rt.ws_queue.put({"__close__": True})
            logger.info("runtime.close group=%s", group_id)

    def arm_idle(
        self,
        group_id: uuid.UUID,
        delay: float,
        on_fire: Callable[[uuid.UUID], Awaitable[None]],
    ) -> None:
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
        rt = self._groups.get(group_id)
        if rt is None:
            return
        if rt.idle_task and not rt.idle_task.done():
            rt.idle_task.cancel()


registry = Registry()
