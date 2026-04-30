"""
Lookups Seed Data (Financial Configuration)

This module populates the foundation of the financial system:
- Prices: Unit rates for water.
- Limits: Daily consumption quotas.
- CustomerTypes: Links a name (e.g., 'normal') to a specific active Price 
  and Limit record.

Connections:
- Used by: app.seed._run_all.
- Logic: Idempotent check based on the CustomerType name.
"""

import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import CustomerType, Limit, Price

logger = logging.getLogger(__name__)


# (name, unit_price, daily_litre_limit)
# Defines the initial system-wide pricing structure.
_TYPES: list[tuple[str, Decimal, Decimal]] = [
    ("normal", Decimal("5.00"), Decimal("50")),
    ("commercial", Decimal("4.00"), Decimal("200")),
]


async def seed(session: AsyncSession, settings: Settings) -> None:
    """
    Seeds initial customer types and their linked pricing/limits.
    
    If a CustomerType with a specific name already exists, it is skipped 
    to prevent duplicate entries or accidental overwrites of modified rates.
    """
    existing_names = set(
        (await session.scalars(select(CustomerType.name))).all()
    )
    for name, unit_price, daily_limit in _TYPES:
        if name in existing_names:
            continue
            
        # Create a new version of price and limit for this type.
        price = Price(unit_price=unit_price, is_active=True)
        limit = Limit(daily_litre_limit=daily_limit, is_active=True)
        session.add_all([price, limit])
        await session.flush()
        
        # Link the type to the newly created snapshots.
        ct = CustomerType(name=name, price_id=price.id, limit_id=limit.id)
        session.add(ct)
        logger.info(
            "seed.customer_type name=%s unit_price=%s limit=%s",
            name, unit_price, daily_limit,
        )
    await session.flush()
