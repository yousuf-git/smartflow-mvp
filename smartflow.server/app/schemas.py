from datetime import datetime
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


# Auth -----------------------------------------------------------------------

class LoginIn(BaseModel):
    email: str
    password: str


class AuthUser(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str


class LoginOut(BaseModel):
    token: str
    user: AuthUser


# Admin ----------------------------------------------------------------------

class AdminDashboardOut(BaseModel):
    total_users: int
    total_customers: int
    total_orders: int
    total_litres_dispensed: float
    total_revenue: float
    today_orders: int
    today_revenue: float
    active_sessions: int


class UserListOut(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    created_at: datetime
    is_active: bool
    plant_name: Optional[str] = None


class CreateUserIn(BaseModel):
    email: str
    first_name: str
    last_name: str
    password: str = Field(min_length=4)
    role: Literal["admin", "manager", "customer"]
    customer_type: Optional[str] = None
    plant_id: Optional[int] = None
    initial_balance: Optional[float] = None


class CustomerListOut(BaseModel):
    user_id: int
    email: str
    first_name: str
    last_name: str
    customer_type: str
    balance: float
    daily_consumed: float


class OrderListOut(BaseModel):
    id: str
    user_email: str
    plant_name: str
    status: str
    total_litres: float
    total_price: float
    cane_count: int
    created_at: datetime


class ControllerOut(BaseModel):
    id: int
    name: str
    status: str


class TapDetailOut(BaseModel):
    id: int
    label: str
    status: str
    is_available: bool


class OperatingHourOut(BaseModel):
    day_of_week: int
    opening_time: str
    closing_time: str
    is_closed: bool


class PlantDetailOut(BaseModel):
    id: int
    name: str
    status: str
    is_active: bool
    controller: Optional[ControllerOut] = None
    taps: list[TapDetailOut]
    operating_hours: list[OperatingHourOut] = []


class TransactionListOut(BaseModel):
    id: int
    user_email: str
    amount: float
    type: str
    timestamp: datetime
    purchase_id: Optional[int] = None


# Manager --------------------------------------------------------------------

class ManagerDashboardOut(BaseModel):
    plant_name: str
    total_orders: int
    total_litres_dispensed: float
    total_revenue: float
    today_orders: int
    today_revenue: float
    active_sessions: int
    tap_count: int


# Customer -------------------------------------------------------------------

class CustomerDashboardOut(BaseModel):
    balance: float
    hold_balance: float
    daily_limit_litres: float
    daily_consumed_litres: float
    daily_remaining_litres: float
    price_per_litre: float
    currency: str
    total_orders: int
    total_litres: float

class CustomerPlantOut(BaseModel):
    id: int
    name: str
    status: str
    is_active: bool
    tap_count: int
    available_taps: int
    operating_hours: list[OperatingHourOut]

class CustomerPurchaseOut(BaseModel):
    id: str
    plant_name: str
    status: str
    total_litres: float
    total_price: float
    cane_count: int
    created_at: datetime
