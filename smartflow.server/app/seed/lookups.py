"""
CustomerType + Price + Limit seed.

V1.1 ships two customer types: `normal` and `commercial`. Each points at one
active Price row and one active Limit row. Rates/limits are time-series —
future changes land as new Price/Limit rows; the type flips its FK to the
new row and the old row sticks around for historical Purchases that
snapshot its id.
"""

import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import CustomerType, Limit, Price

logger = logging.getLogger(__name__)


# (name, unit_price, daily_litre_limit)
_TYPES: list[tuple[str, Decimal, Decimal]] = [
    ("normal", Decimal("5.00"), Decimal("50")),
    ("commercial", Decimal("4.00"), Decimal("200")),
]


async def seed(session: AsyncSession, settings: Settings) -> None:
    existing_names = set(
        (await session.scalars(select(CustomerType.name))).all()
    )
    for name, unit_price, daily_limit in _TYPES:
        if name in existing_names:
            continue
        price = Price(unit_price=unit_price, is_active=True)
        limit = Limit(daily_litre_limit=daily_limit, is_active=True)
        session.add_all([price, limit])
        await session.flush()
        ct = CustomerType(name=name, price_id=price.id, limit_id=limit.id)
        session.add(ct)
        logger.info(
            "seed.customer_type name=%s unit_price=%s limit=%s",
            name, unit_price, daily_limit,
        )
    await session.flush()
