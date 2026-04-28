from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


# Catalogue ------------------------------------------------------------------

class TapOut(BaseModel):
    id: int
    label: str


class PlantOut(BaseModel):
    id: int
    name: str
    taps: list[TapOut]


class CatalogueOut(BaseModel):
    plants: list[PlantOut]


# Me -------------------------------------------------------------------------

class MeOut(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    customer_type: str
    currency: str
    price_per_litre: float
    balance: float
    hold_balance: float
    daily_limit_litres: float
    daily_consumed_litres: float
    daily_hold_litres: float
    daily_remaining_litres: float


# Order (PurchaseGroup) ------------------------------------------------------

class CaneIn(BaseModel):
    tap_id: int
    litres: Decimal = Field(gt=0)


class OrderIn(BaseModel):
    plant_id: int
    canes: list[CaneIn] = Field(min_length=1, max_length=4)


class CaneOut(BaseModel):
    id: int
    tap_id: int
    cane_number: int
    litres_requested: float
    litres_delivered: float
    price: float
    status: Literal[
        "pending",
        "started",
        "completed",
        "partial_completed",
        "failed",
        "cancelled",
    ]
    retry_count: int
    reason: Optional[str] = None


class OrderOut(BaseModel):
    id: str  # uuid str
    plant_id: int
    status: Literal["active", "completed", "cancelled"]
    total_litres: float
    total_price: float
    canes: list[CaneOut]
