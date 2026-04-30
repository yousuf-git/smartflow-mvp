"""
Infrastructure Seed Data (Physical Hardware Configuration)

This module initializes the physical layer of the system:
- Plants: The physical sites (e.g., Lahore filtration plant).
- Controllers: The IoT devices (e.g., ESP32) located at each site.
- Taps: The dispensing nozzles managed by each controller.
- OperatingHours: The business schedule for each plant.

Connections:
- Used by: app.seed._run_all.
- Logic: Populates defaults from `Settings`. Idempotent check based on names/labels.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Controller, ControllerStatus, OperatingHour, Plant, PlantStatus, Tap, TapStatus

logger = logging.getLogger(__name__)


async def seed(session: AsyncSession, settings: Settings) -> None:
    """
    Seeds the initial plant, its controller, and associated taps.
    
    Logic:
    1. Creates a default Plant using settings.PLANT_NAME.
    2. Registers a Controller for the plant using settings.CONTROLLER_NAME.
    3. Parses settings.TAPS to create physical nozzles on the controller.
    4. Initializes a standard 7-day operating schedule.
    """
    plant = (
        await session.scalars(select(Plant).where(Plant.name == settings.PLANT_NAME))
    ).one_or_none()
    if plant is None:
        plant = Plant(
            name=settings.PLANT_NAME,
            city="Lahore",
            province="Punjab",
            area="Johar Town",
            address="Main Boulevard, Johar Town",
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
        # Link controller to AWS IoT using settings.CONTROLLER_NAME as the com_id.
        controller = Controller(
            name=settings.CONTROLLER_NAME,
            com_id=settings.CONTROLLER_NAME,
            plant_id=plant.id,
            status=ControllerStatus.operational,
            is_active=True,
        )
        session.add(controller)
        await session.flush()
        logger.info("seed.controller id=%s name=%s plant=%s", controller.id, controller.name, plant.id)

    # Tap Seeding
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
                gpio_pin_number=idx,  # Logical placeholder for hardware mapping.
                status=TapStatus.operational,
                is_available=True,
                label=tap_label,
            )
        )
        logger.info("seed.tap code=%s label=%s gpio=%s", tap_code, tap_label, idx)
    await session.flush()

    # Operating Hours Seeding
    existing_hours = (
        await session.scalars(
            select(OperatingHour).where(OperatingHour.plant_id == plant.id)
        )
    ).first()
    if existing_hours is None:
        # Standard Pakistani business hours schedule:
        # Mon-Fri 8:00-18:00, Sat 9:00-14:00, Sun closed.
        schedule = [
            (0, "08:00", "18:00", False),  # Sun (will be overridden below)
            (1, "08:00", "18:00", False),  # Mon
            (2, "08:00", "18:00", False),  # Tue
            (3, "08:00", "18:00", False),  # Wed
            (4, "08:00", "18:00", False),  # Thu
            (5, "08:00", "18:00", False),  # Fri
            (6, "09:00", "14:00", False),  # Sat
        ]
        schedule[0] = (0, "00:00", "00:00", True)  # Mark Sunday as closed.
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
