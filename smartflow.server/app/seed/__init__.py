"""
Seed orchestration.

Each file in this package owns one slice of seed data. They all expose a
single `async def seed(session, settings) -> None` that is idempotent: safe
to run on every boot. Order matters when one slice FKs into another.

Keep the total volume *minimal* — just enough to exercise the current
version's flow. Production data belongs in migrations or operator tools,
not here.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db import get_engine, get_sessionmaker
from app.models import Base

from app.seed import lookups, infrastructure, demo_user

logger = logging.getLogger(__name__)


async def init_schema_and_seed(settings: Settings) -> None:
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("db.schema.ready")

    sm = get_sessionmaker()
    async with sm() as session:
        await _run_all(session, settings)
        await session.commit()


async def _run_all(session: AsyncSession, settings: Settings) -> None:
    # Order matters — later slices FK into earlier ones.
    await lookups.seed(session, settings)
    await infrastructure.seed(session, settings)
    await demo_user.seed(session, settings)
