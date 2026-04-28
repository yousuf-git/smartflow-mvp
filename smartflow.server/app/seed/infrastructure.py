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
from app.models import Controller, ControllerStatus, Plant, PlantStatus, Tap, TapStatus

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
