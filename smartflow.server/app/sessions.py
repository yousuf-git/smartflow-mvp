import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Session:
    id: str
    litres: float
    ack_future: asyncio.Future
    progress_queue: asyncio.Queue
    created_at: float = field(default_factory=time.monotonic)
    ws: Any = None
    terminal: bool = False


class SessionRegistry:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = asyncio.Lock()

    async def create(self, litres: float) -> Session:
        loop = asyncio.get_running_loop()
        session = Session(
            id=str(uuid.uuid4()),
            litres=litres,
            ack_future=loop.create_future(),
            progress_queue=asyncio.Queue(),
        )
        async with self._lock:
            self._sessions[session.id] = session
        logger.info("session.create id=%s litres=%s", session.id, litres)
        return session

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    async def resolve_ack(self, session_id: str, payload: dict) -> None:
        session = self._sessions.get(session_id)
        if not session:
            logger.warning("session.ack.unknown id=%s", session_id)
            return
        if session.ack_future.done():
            logger.warning("session.ack.late id=%s", session_id)
            return
        session.ack_future.set_result(payload)
        logger.info("session.ack id=%s status=%s", session_id, payload.get("status"))

    async def push_progress(self, session_id: str, payload: dict) -> None:
        session = self._sessions.get(session_id)
        if not session:
            logger.warning("session.progress.unknown id=%s", session_id)
            return
        if session.terminal:
            logger.warning("session.progress.after-terminal id=%s", session_id)
            return
        status = payload.get("status")
        if status in ("complete", "failed"):
            session.terminal = True
        await session.progress_queue.put(payload)
        logger.info(
            "session.progress id=%s litres=%s status=%s",
            session_id,
            payload.get("litres"),
            status,
        )

    async def cleanup(self, session_id: str, delay: float = 60.0) -> None:
        await asyncio.sleep(delay)
        async with self._lock:
            self._sessions.pop(session_id, None)
        logger.info("session.cleanup id=%s", session_id)


registry = SessionRegistry()
