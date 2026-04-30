"""
Plant + Controller + Tap seed.

V1.1 seeds one plant with one controller and the taps described by
`settings.TAPS`. The controller's `name` is what the MQTT topic keys off
(`smartflow/cmd/{controller_name}`).
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Controller, ControllerStatus, OperatingHour, Plant, PlantStatus, Tap, TapStatus

logger = logging.getLogger(__name__)


async def seed(session: AsyncSession, settings: Settings) -> None:
    plant = (
        await session.scalars(select(Plant).where(Plant.name == settings.PLANT_NAME))
    ).one_or_none()
    if plant is None:
        plant = Plant(
            name=settings.PLANT_NAME,
            status=PlantStatus.operational,
            is_active=True,
        )
        session.add(plant)
        await session.flush()
        logger.info("seed.plant id=%s name=%s", plant.id, plant.name)

    controller = (
        await session.scalars(select(Controller).where(Controller.name == settings.CONTROLLER_NAME))
    ).one_or_none()
    if controller is None:
        controller = Controller(
            name=settings.CONTROLLER_NAME,
            plant_id=plant.id,
            status=ControllerStatus.operational,
            is_active=True,
        )
        session.add(controller)
        await session.flush()
        logger.info("seed.controller id=%s name=%s plant=%s", controller.id, controller.name, plant.id)

    existing_labels = set(
        (
            await session.scalars(
                select(Tap.label).where(Tap.controller_id == controller.id)
            )
        ).all()
    )
    for idx, (tap_code, tap_label) in enumerate(settings.taps_parsed, start=1):
        if tap_label in existing_labels:
            continue
        session.add(
            Tap(
                controller_id=controller.id,
                plant_id=plant.id,
                gpio_pin_number=idx,  # placeholder — firmware wiring decides the real pin later
                status=TapStatus.operational,
                is_available=True,
                label=tap_label,
            )
        )
        logger.info("seed.tap code=%s label=%s gpio=%s", tap_code, tap_label, idx)
    await session.flush()

    existing_hours = (
        await session.scalars(
            select(OperatingHour).where(OperatingHour.plant_id == plant.id)
        )
    ).first()
    if existing_hours is None:
        # Mon-Fri 8:00-18:00, Sat 9:00-14:00, Sun closed
        schedule = [
            (0, "08:00", "18:00", False),  # Sun → closed below
            (1, "08:00", "18:00", False),  # Mon
            (2, "08:00", "18:00", False),  # Tue
            (3, "08:00", "18:00", False),  # Wed
            (4, "08:00", "18:00", False),  # Thu
            (5, "08:00", "18:00", False),  # Fri
            (6, "09:00", "14:00", False),  # Sat
        ]
        schedule[0] = (0, "00:00", "00:00", True)  # Sun closed
        for dow, open_t, close_t, closed in schedule:
            session.add(OperatingHour(
                plant_id=plant.id,
                day_of_week=dow,
                opening_time=open_t,
                closing_time=close_t,
                is_closed=closed,
            ))
        logger.info("seed.operating_hours plant=%s", plant.id)
        await session.flush()
