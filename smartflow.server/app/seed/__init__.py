"""
Database Seeding & Schema Orchestration

This package manages the initial population of the database with essential 
data (lookups, infrastructure, and demo users). It ensures that a fresh 
database is ready for use immediately after deployment.

Key Features:
- Idempotency: All seed functions use 'upsert' logic, making them safe to 
  run multiple times (e.g., on every application boot).
- Dependency Management: Seeding is performed in a specific order to 
  satisfy Foreign Key constraints (Lookups -> Infrastructure -> Users).

Connections:
- Used by: app.main (lifespan) during application startup.
- Uses: app.seed.lookups, app.seed.infrastructure, app.seed.demo_user.
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db import get_engine, get_sessionmaker
from app.models import Base

from app.seed import lookups, infrastructure, demo_user

logger = logging.getLogger(__name__)


async def init_schema_and_seed(settings: Settings) -> None:
    """
    Ensures the database schema exists and populates it with default data.
    
    1. metadata.create_all: Creates tables if they don't exist.
    2. _run_all: Executes the individual seed modules.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        # await conn.run_sync(Base.metadata.drop_all)   # if we want to reset the schema on every boot
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)"))
        await conn.execute(text("ALTER TABLE customer_types ADD COLUMN IF NOT EXISTS description VARCHAR(512) DEFAULT ''"))
        await conn.execute(text("ALTER TABLE customer_types ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()"))
        await conn.execute(text("ALTER TABLE customer_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()"))
        await conn.execute(text("ALTER TABLE prices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()"))
        await conn.execute(text("ALTER TABLE prices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()"))
        await conn.execute(text("ALTER TABLE limits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()"))
        await conn.execute(text("ALTER TABLE limits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()"))
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = 'partial_completed'
                    AND enumtypid = 'purchase_group_status'::regtype
                ) THEN
                    ALTER TYPE purchase_group_status ADD VALUE 'partial_completed';
                END IF;
            END$$;
        """))
    logger.info("db.schema.ready")

    sm = get_sessionmaker()
    async with sm() as session:
        await _run_all(session, settings)
        await session.commit()


async def _run_all(session: AsyncSession, settings: Settings) -> None:
    """
    Triggers all seed modules in the correct order.
    
    Order is critical:
    - lookups: Provides Prices and Limits (required by CustomerTypes).
    - infrastructure: Provides Plants and Controllers (required by Users/Managers).
    - demo_user: Provides Admin, Manager, and Customer accounts.
    """
    await lookups.seed(session, settings)
    await infrastructure.seed(session, settings)
    await demo_user.seed(session, settings)
