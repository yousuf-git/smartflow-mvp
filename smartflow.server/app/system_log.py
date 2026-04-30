"""
System Auditing & Database Logging Utility

This module provides a unified interface for recording important system 
events, errors, and user actions directly into the database. These logs 
are accessible via the Global Admin dashboard for troubleshooting.

Connections:
- Used by: Auth, Admin, and Manager routes to track lifecycle events.
- Uses: app.models (SystemLog).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LogLevel, SystemLog


async def log_event(
    session: AsyncSession,
    level: str,
    message: str,
    source: str,
    user_id: int | None = None,
) -> None:
    """
    Persists a log entry to the 'system_logs' table.
    
    Args:
        session: The active database session.
        level: Severity (info, warning, error, critical).
        message: Descriptive text (truncated to 1024 chars).
        source: Component name or endpoint triggering the log (truncated to 128 chars).
        user_id: Optional reference to the user involved in the event.
    """
    session.add(SystemLog(
        level=LogLevel(level),
        message=message[:1024],
        source=source[:128],
        user_id=user_id,
    ))
