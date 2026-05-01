"""
API Data Schemas (Pydantic Models)

This module defines the Pydantic models used for data validation and 
serialization across the API. It ensures that incoming request bodies 
adhere to the expected structure and that outgoing responses are 
consistently formatted.

The schemas are organized by domain:
- Catalogue: Infrastructure discovery for customers.
- Me: User profile and wallet summary.
- Order: Water purchase requests and status updates.
- Auth: Login, Signup, and Token responses.
- Admin: High-level dashboard stats and CRUD operations.
- Manager: Plant-specific operations.
- Customer: Detailed dashboard and plant status for end-users.

Connections:
- Used by: app.routes, app.routes_admin, app.routes_auth, app.routes_customer, 
  and app.routes_manager to define endpoint request/response types.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


# -- Infrastructure Catalogue ------------------------------------------------

class TapOut(BaseModel):
    """Simplified tap view for selection."""
    id: int
    label: str


class PlantOut(BaseModel):
    """Simplified plant view for selection."""
    id: int
    name: str
    taps: list[TapOut]


class CatalogueOut(BaseModel):
    """List of all available plants and their taps."""
    plants: list[PlantOut]


# -- User Identity & Wallet --------------------------------------------------

class MeOut(BaseModel):
    """Comprehensive user profile and real-time wallet summary."""
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


# -- Order & Cane Lifecycle --------------------------------------------------

class CaneIn(BaseModel):
    """Input for a single cane in an order."""
    tap_id: int
    litres: Decimal = Field(gt=0)


class OrderIn(BaseModel):
    """Input for creating a new multi-cane order."""
    plant_id: int
    canes: list[CaneIn] = Field(min_length=1, max_length=4)


class CaneOut(BaseModel):
    """Detailed status of a single dispensing operation (cane)."""
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
    """Detailed summary of an entire purchase group (order)."""
    id: str  # UUID as string
    plant_id: int
    status: Literal["active", "completed", "partial_completed", "cancelled"]
    total_litres: float
    total_price: float
    canes: list[CaneOut]


# -- Authentication ----------------------------------------------------------

class LoginIn(BaseModel):
    """Login credentials."""
    email: str
    password: str
    remember_me: bool = False


class AuthUser(BaseModel):
    """Minimal user data included in auth responses."""
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None


class LoginOut(BaseModel):
    """Token and user profile returned after successful login."""
    token: str
    user: AuthUser


class SignupIn(BaseModel):
    """Registration data for a new customer."""
    email: str
    first_name: str
    last_name: str
    password: str = Field(min_length=6)
    phone: Optional[str] = None
    customer_type_id: int


class ProfileUpdateIn(BaseModel):
    """Fields a signed-in user can update on their own profile."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=6)


class CustomerTypePublicOut(BaseModel):
    """Public details about customer types, used during signup."""
    id: int
    name: str
    description: str = ""
    unit_price: float
    daily_litre_limit: float


# -- Administrative Dashboard & CRUD -----------------------------------------

class AdminDashboardOut(BaseModel):
    """High-level metrics for the global admin dashboard."""
    total_users: int
    total_customers: int
    total_orders: int
    total_litres_dispensed: float
    total_revenue: float
    today_orders: int
    today_revenue: float
    active_sessions: int


class UserListOut(BaseModel):
    """Detailed user record for administrative listings."""
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    is_active: bool
    plant_name: Optional[str] = None
    deleted_at: Optional[datetime] = None
    customer_type: Optional[str] = None
    balance: Optional[float] = None


class CreateUserIn(BaseModel):
    """Input for an admin to manually create any type of user."""
    email: str
    first_name: str
    last_name: str
    password: str = Field(min_length=4)
    role: Literal["admin", "manager", "customer"]
    phone: Optional[str] = None
    customer_type: Optional[str] = None
    plant_id: Optional[int] = None
    initial_balance: Optional[float] = None


class UserUpdateIn(BaseModel):
    """Fields that can be updated for a user profile."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=4)
    role: Optional[Literal["admin", "manager", "customer"]] = None
    is_active: Optional[bool] = None
    plant_id: Optional[int] = None
    customer_type_id: Optional[int] = None


class CustomerListOut(BaseModel):
    """Simplified customer record for administrative listings."""
    user_id: int
    email: str
    first_name: str
    last_name: str
    avatar_url: Optional[str] = None
    customer_type: str
    balance: float
    daily_consumed: float


class OrderCaneOut(BaseModel):
    """Per-cane detail for admin/manager order listings."""
    id: int
    tap_label: str
    cane_number: int
    litres_requested: float
    litres_delivered: float
    price: float
    status: str
    reason: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class OrderListOut(BaseModel):
    """Summary of an order for administrative listings."""
    id: str
    user_email: str
    plant_name: str
    status: str
    total_litres: float
    total_price: float
    unit_price: Optional[float] = None
    daily_litre_limit: Optional[float] = None
    cane_count: int
    created_at: datetime
    canes: list[OrderCaneOut] = []


class ControllerOut(BaseModel):
    """IoT Controller details."""
    id: int
    name: str
    com_id: str = ""
    status: str
    is_active: bool = True


class TapDetailOut(BaseModel):
    """Full tap details for administrative management."""
    id: int
    label: str
    status: str
    is_available: bool
    gpio_pin_number: int = 0


class OperatingHourOut(BaseModel):
    """Operational hours for a plant."""
    id: int = 0
    day_of_week: int
    opening_time: str
    closing_time: str
    is_closed: bool


class PlantDetailOut(BaseModel):
    """Comprehensive plant details including its full infrastructure."""
    id: int
    name: str
    city: str = ""
    province: str = ""
    area: str = ""
    address: str = ""
    status: str
    is_active: bool
    controller: Optional[ControllerOut] = None # Legacy support
    controllers: list[ControllerOut] = []
    taps: list[TapDetailOut]
    operating_hours: list[OperatingHourOut] = []


class TransactionListOut(BaseModel):
    """Wallet transaction record for administrative listings."""
    id: int
    user_email: str
    amount: float
    type: str
    timestamp: datetime
    purchase_id: Optional[int] = None


# -- Admin CRUD Inputs -------------------------------------------------------

class PlantCreateIn(BaseModel):
    """Input for creating a new plant."""
    name: str
    city: str = ""
    province: str = ""
    area: str = ""
    address: str = ""
    status: Optional[str] = None
    is_active: bool = False


class PlantUpdateIn(BaseModel):
    """Fields that can be updated for a plant."""
    name: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    area: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None


class ControllerCreateIn(BaseModel):
    """Input for creating a new IoT controller."""
    name: str
    com_id: str = ""
    status: Optional[str] = None
    is_active: bool = True


class ControllerUpdateIn(BaseModel):
    """Fields that can be updated for a controller."""
    name: Optional[str] = None
    com_id: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None


class TapCreateIn(BaseModel):
    """Input for creating a new tap."""
    controller_id: int
    label: str
    gpio_pin_number: int = 0
    status: Optional[str] = None


class TapUpdateIn(BaseModel):
    """Fields that can be updated for a tap."""
    label: Optional[str] = None
    gpio_pin_number: Optional[int] = None
    status: Optional[str] = None


class OperatingHourCreateIn(BaseModel):
    """Input for creating operating hours."""
    day_of_week: int = Field(ge=0, le=6)
    opening_time: str = "08:00"
    closing_time: str = "18:00"
    is_closed: bool = False


class OperatingHourUpdateIn(BaseModel):
    """Fields that can be updated for operating hours."""
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    opening_time: Optional[str] = None
    closing_time: Optional[str] = None
    is_closed: Optional[bool] = None


class CustomerTypeCreateIn(BaseModel):
    """Input for creating a new customer category."""
    name: str
    description: str = ""
    price_id: int
    limit_id: int


class CustomerTypeUpdateIn(BaseModel):
    """Fields that can be updated for a customer category."""
    name: Optional[str] = None
    description: Optional[str] = None
    price_id: Optional[int] = None
    limit_id: Optional[int] = None


class PriceCreateIn(BaseModel):
    """Input for defining a new price point."""
    unit_price: float
    is_active: bool = True


class PriceUpdateIn(BaseModel):
    """Fields that can be updated for a price point."""
    unit_price: Optional[float] = None
    is_active: Optional[bool] = None


class LimitCreateIn(BaseModel):
    """Input for defining a new consumption limit."""
    daily_litre_limit: float
    is_active: bool = True


class LimitUpdateIn(BaseModel):
    """Fields that can be updated for a limit."""
    daily_litre_limit: Optional[float] = None
    is_active: Optional[bool] = None


# -- Administrative Output Models --------------------------------------------

class PriceOut(BaseModel):
    """Price record details."""
    id: int
    currency: str
    unit_price: float
    is_active: bool
    timestamp: datetime
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class LimitOut(BaseModel):
    """Limit record details."""
    id: int
    daily_litre_limit: float
    is_active: bool
    timestamp: datetime
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class CustomerTypeOut(BaseModel):
    """Customer type details, including current price and limit values."""
    id: int
    name: str
    description: str = ""
    price_id: int
    limit_id: int
    unit_price: float = 0
    daily_litre_limit: float = 0
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class SystemLogOut(BaseModel):
    """System log entry."""
    id: int
    level: str
    message: str
    source: str
    user_id: Optional[int] = None
    created_at: datetime


class ChartDataPoint(BaseModel):
    """A single point in a time-series chart."""
    date: str
    value: float


class AdminChartData(BaseModel):
    """Aggregated data for administrative charts."""
    revenue_chart: list[ChartDataPoint]
    orders_chart: list[ChartDataPoint]
    customer_types: list[dict]


# -- Manager Domain ----------------------------------------------------------

class ManagerDashboardOut(BaseModel):
    """Metrics for the plant-specific manager dashboard."""
    plant_name: str
    total_orders: int
    total_litres_dispensed: float
    total_revenue: float
    today_orders: int
    today_revenue: float
    active_sessions: int
    tap_count: int


class StatusUpdateIn(BaseModel):
    """Generic status update input for managers."""
    status: str
    is_active: Optional[bool] = None


# -- Customer Domain ---------------------------------------------------------

class CustomerDashboardOut(BaseModel):
    """Aggregated data for the customer home screen."""
    balance: float
    hold_balance: float
    daily_limit_litres: float
    daily_consumed_litres: float
    daily_remaining_litres: float
    price_per_litre: float
    currency: str
    total_orders: int
    total_litres: float


class CustomerTapOut(BaseModel):
    """Detailed tap status for customers."""
    id: int
    label: str
    status: str
    is_available: bool
    is_busy: bool = False


class CustomerPlantOut(BaseModel):
    """Detailed plant status and infrastructure for customers."""
    id: int
    name: str
    city: str = ""
    province: str = ""
    area: str = ""
    address: str = ""
    status: str
    is_active: bool
    tap_count: int
    available_taps: int
    taps: list[CustomerTapOut] = []
    operating_hours: list[OperatingHourOut]


class CustomerCaneDetailOut(BaseModel):
    """Per-cane detail in purchase history."""
    id: int
    tap_label: str
    cane_number: int
    litres_requested: float
    litres_delivered: float
    price: float
    status: str
    reason: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class CustomerPurchaseOut(BaseModel):
    """Detailed purchase history for the customer transaction tab."""
    id: str
    plant_name: str
    status: str
    total_litres: float
    total_price: float
    cane_count: int
    created_at: datetime
    canes: list[CustomerCaneDetailOut] = []


class CustomerTopUpIn(BaseModel):
    """Dummy wallet top-up request."""
    amount: float = Field(gt=0)
    method: Literal["Jazzcash", "Easypaisa"]


class CustomerProfileUpdateIn(BaseModel):
    """Inline editable customer profile fields."""
    first_name: str = Field(min_length=1, max_length=64)
    last_name: str = Field(min_length=1, max_length=64)
