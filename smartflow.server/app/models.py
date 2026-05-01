"""
SQLAlchemy Models & Database Schema Definition

This module defines the structural blueprint of the database. It uses SQLAlchemy's 
Declarative Mapping to align Python classes with database tables, following 
the architecture described in docs/TARGET_DB.md.

The schema is designed for a multi-tenant water dispensing system, covering:
1. Pricing & Limits: Dynamic rate management based on customer types.
2. User Management: RBAC (Admin, Manager, Customer) and profiles.
3. Infrastructure: Physical hierarchy of Plants -> Controllers -> Taps.
4. Transactional: PurchaseGroups (orders) and individual Purchases (canes).
5. Financial: Wallet transactions and ledger for virtual currency.
6. Audit: System logs and operating hours.

Naming Conventions:
- Tables: snake_case plural (e.g., `wallet_transactions`).
- Classes: PascalCase singular (e.g., `WalletTransaction`).
"""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """
    Common base class for all models to enable declarative mapping.
    """
    pass


# ---------------------------------------------------------------------------
# Pricing & limits (Time-series / Snapshot data)
# ---------------------------------------------------------------------------

class Price(Base):
    """
    Represents a specific price point. 
    Snapshotted by 'Purchase' rows to preserve historical rates.
    """
    __tablename__ = "prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    currency: Mapped[str] = mapped_column(String(8), default="Rs.")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)


class Limit(Base):
    """
    Defines consumption constraints (e.g., daily litre limits).
    Snapshotted by 'Purchase' rows to enforce limits at the time of purchase.
    """
    __tablename__ = "limits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    daily_litre_limit: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)


class CustomerType(Base):
    """
    Categorizes customers (e.g., 'Normal', 'Commercial') and links them 
    to specific active Price and Limit plans.
    """
    __tablename__ = "customer_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    description: Mapped[str] = mapped_column(String(512), default="")
    price_id: Mapped[int] = mapped_column(ForeignKey("prices.id"))
    limit_id: Mapped[int] = mapped_column(ForeignKey("limits.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    price: Mapped[Price] = relationship(foreign_keys=[price_id])
    limit: Mapped[Limit] = relationship(foreign_keys=[limit_id])


# ---------------------------------------------------------------------------
# User & Identity
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    """System-wide roles for access control."""
    admin = "admin"      # Global management
    manager = "manager"  # Plant-specific management
    customer = "customer" # End users


class User(Base):
    """
    Primary identity record. Handles authentication and role assignment.
    Managers are optionally linked to a specific 'plant_id'.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(128), unique=True)
    first_name: Mapped[str] = mapped_column(String(64))
    last_name: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(256), default="")
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"), default=UserRole.customer
    )
    plant_id: Mapped[int | None] = mapped_column(ForeignKey("plants.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    # 1-to-1 relationship with Customer profile (only for role='customer')
    customer: Mapped["Customer"] = relationship(back_populates="user", uselist=False)


class Customer(Base):
    """
    Extended profile for end-users, linking them to a CustomerType.
    """
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    customer_type_id: Mapped[int] = mapped_column(ForeignKey("customer_types.id"))

    user: Mapped[User] = relationship(back_populates="customer")
    customer_type: Mapped[CustomerType] = relationship()


# ---------------------------------------------------------------------------
# Infrastructure (Physical Hardware Mapping)
# ---------------------------------------------------------------------------

class PlantStatus(str, enum.Enum):
    operational = "operational"
    under_review = "under_review"
    maintenance = "maintenance"


class Plant(Base):
    """
    A physical water filtration site. Acts as the container for controllers and taps.
    """
    __tablename__ = "plants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128))
    city: Mapped[str] = mapped_column(String(128), default="")
    province: Mapped[str] = mapped_column(String(128), default="")
    area: Mapped[str] = mapped_column(String(128), default="")
    address: Mapped[str] = mapped_column(String(256), default="")
    status: Mapped[PlantStatus] = mapped_column(
        SAEnum(PlantStatus, name="plant_status"), default=PlantStatus.under_review
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    controllers: Mapped[list["Controller"]] = relationship(back_populates="plant", order_by="Controller.id")
    taps: Mapped[list["Tap"]] = relationship(back_populates="plant", order_by="Tap.id")


class ControllerStatus(str, enum.Enum):
    operational = "operational"
    maintenance = "maintenance"


class Controller(Base):
    """
    An IoT device (e.g., ESP32) that controls one or more taps.
    Linked to AWS IoT via 'com_id' (used in MQTT topics).
    """
    __tablename__ = "controllers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    com_id: Mapped[str] = mapped_column(String(32), default="") # Hardware Identifier
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    status: Mapped[ControllerStatus] = mapped_column(
        SAEnum(ControllerStatus, name="controller_status"), default=ControllerStatus.operational
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    plant: Mapped[Plant] = relationship(back_populates="controllers")
    taps: Mapped[list["Tap"]] = relationship(back_populates="controller", order_by="Tap.id")


class TapStatus(str, enum.Enum):
    operational = "operational"
    maintenance = "maintenance"


class Tap(Base):
    """
    A physical nozzle where water is dispensed.
    Mapped to a specific 'gpio_pin_number' on its parent controller.
    """
    __tablename__ = "taps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    controller_id: Mapped[int] = mapped_column(ForeignKey("controllers.id"))
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    gpio_pin_number: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[TapStatus] = mapped_column(
        SAEnum(TapStatus, name="tap_status"), default=TapStatus.operational
    )
    is_available: Mapped[bool] = mapped_column(Boolean, default=True) # Runtime lockout
    label: Mapped[str] = mapped_column(String(64))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    controller: Mapped[Controller] = relationship(back_populates="taps")
    plant: Mapped[Plant] = relationship(back_populates="taps")


# ---------------------------------------------------------------------------
# Purchases & Orders (Transactional Logic)
# ---------------------------------------------------------------------------

class PurchaseGroupStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class PurchaseStatus(str, enum.Enum):
    pending = "pending"             # Order created, waiting for user to 'Start'
    started = "started"             # Device acknowledged and is dispensing
    completed = "completed"         # Dispensed full requested volume
    partial_completed = "partial_completed" # User stopped early or hardware issue
    failed = "failed"               # System error / Device timeout
    cancelled = "cancelled"         # Cancelled by user before starting


class PurchaseGroup(Base):
    """
    Groups multiple cane purchases into a single 'Order'.
    Uses a UUID for its primary key to keep order URLs non-sequential/secure.
    """
    __tablename__ = "purchase_groups"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    status: Mapped[PurchaseGroupStatus] = mapped_column(
        SAEnum(PurchaseGroupStatus, name="purchase_group_status"),
        default=PurchaseGroupStatus.active,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    purchases: Mapped[list["Purchase"]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="Purchase.id",
    )


class Purchase(Base):
    """
    Represents the dispensing of a single cane.
    Stores the snapshot of Price and Limit IDs at the moment of creation.
    Tracks requested vs. delivered volume and the lifecycle of the dispense.
    """
    __tablename__ = "purchases"
    __table_args__ = (
        # Business Constraint: Max 2 canes per tap per order for V1.1
        CheckConstraint("cane_number BETWEEN 1 AND 2", name="ck_cane_number_range"),
        UniqueConstraint("group_id", "tap_id", "cane_number", name="uq_group_tap_cane"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_groups.id", ondelete="CASCADE"))
    price_id: Mapped[int] = mapped_column(ForeignKey("prices.id"))
    limit_id: Mapped[int] = mapped_column(ForeignKey("limits.id"))
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    tap_id: Mapped[int] = mapped_column(ForeignKey("taps.id"))

    date_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    litres_count: Mapped[Decimal] = mapped_column(Numeric(10, 2))  # Requested volume
    litres_delivered: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0")) # Actual volume
    
    cane_number: Mapped[int] = mapped_column(Integer) # 1 or 2
    status: Mapped[PurchaseStatus] = mapped_column(
        SAEnum(PurchaseStatus, name="purchase_status"), default=PurchaseStatus.pending
    )
    
    # Retry logic for start command ACKs
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    retry_window_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    reason: Mapped[str | None] = mapped_column(String(256), nullable=True) # Error/Stop reason
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    group: Mapped[PurchaseGroup] = relationship(back_populates="purchases")
    price: Mapped[Price] = relationship(foreign_keys=[price_id])
    limit: Mapped[Limit] = relationship(foreign_keys=[limit_id])
    tap: Mapped[Tap] = relationship()


# ---------------------------------------------------------------------------
# Operating Hours
# ---------------------------------------------------------------------------

class OperatingHour(Base):
    """
    Defines when a plant is open for business.
    """
    __tablename__ = "operating_hours"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    day_of_week: Mapped[int] = mapped_column(Integer)  # 0=Sun … 6=Sat
    opening_time: Mapped[str] = mapped_column(String(8), default="08:00")  # HH:MM
    closing_time: Mapped[str] = mapped_column(String(8), default="18:00")
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)

    plant: Mapped[Plant] = relationship()


# ---------------------------------------------------------------------------
# Financial Ledger (Wallet System)
# ---------------------------------------------------------------------------

class WalletTransactionType(str, enum.Enum):
    credit = "credit"  # Deposits / Refunds
    debit = "debit"    # Payments for water


class WalletTransaction(Base):
    """
    Audit trail for all virtual currency movements.
    Debits are created when a dispense starts. Credits are for deposits or 
    refunds if a dispense stops early.
    """
    __tablename__ = "wallet_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    transaction_type: Mapped[WalletTransactionType] = mapped_column(
        SAEnum(WalletTransactionType, name="wallet_transaction_type"),
        default=WalletTransactionType.debit,
    )
    # Optional link to the purchase that triggered this transaction.
    purchase_id: Mapped[int | None] = mapped_column(ForeignKey("purchases.id"), nullable=True)


# ---------------------------------------------------------------------------
# System Auditing
# ---------------------------------------------------------------------------

class LogLevel(str, enum.Enum):
    info = "info"
    warning = "warning"
    error = "error"
    critical = "critical"


class SystemLog(Base):
    """
    Centralized database logging for critical system events.
    Used for troubleshooting hardware communication and user errors.
    """
    __tablename__ = "system_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    level: Mapped[LogLevel] = mapped_column(SAEnum(LogLevel, name="log_level"), default=LogLevel.info)
    message: Mapped[str] = mapped_column(String(1024))
    source: Mapped[str] = mapped_column(String(128), default="")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
