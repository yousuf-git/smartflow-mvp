"""
Database Configuration and Session Management

This module handles the asynchronous connection to the PostgreSQL database 
using SQLAlchemy. It provides a global engine and sessionmaker, as well 
as utility functions for scoped session management and engine disposal.

Key Components:
- AsyncEngine: The core database connection pool.
- async_sessionmaker: Factory for creating new AsyncSession instances.
- session_scope: Async iterator for safe, contextual session management.

Connections:
- Used by: app.main (lifespan), app.auth (get_current_user), and all service/route modules.
- Dependencies: app.config (Settings).
"""

import logging
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import Settings

logger = logging.getLogger(__name__)

# Singletons for the engine and sessionmaker to ensure efficient connection pooling.
_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def init_engine(settings: Settings) -> AsyncEngine:
    """
    Initializes the global SQLAlchemy AsyncEngine and sessionmaker.
    
    Args:
        settings: Application settings containing the DATABASE_URL.
        
    Returns:
        The initialized AsyncEngine.
        
    Raises:
        RuntimeError: If DATABASE_URL is missing.
    """
    global _engine, _sessionmaker
    if not settings.DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    _engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
    )
    _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_engine() -> AsyncEngine:
    """
    Retrieves the global database engine.
    
    Note: init_engine must be called before this.
    """
    assert _engine is not None, "engine not initialised; call init_engine first"
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """
    Retrieves the global sessionmaker.
    
    Note: init_engine must be called before this.
    """
    assert _sessionmaker is not None, "sessionmaker not initialised"
    return _sessionmaker


async def session_scope() -> AsyncIterator[AsyncSession]:
    """
    Provides a transactional scope for database operations.
    
    Usage:
        async with session_scope() as session:
            await session.execute(...)
    """
    sm = get_sessionmaker()
    async with sm() as session:
        yield session


async def dispose_engine() -> None:
    """
    Gracefully closes all database connections in the pool.
    Called during application shutdown in main.py.
    """
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
