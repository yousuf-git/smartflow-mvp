"""
SQLAlchemy models aligned with docs/TARGET_DB.md/entities_context.md.

Scope for V1.1: minimal columns needed for the multi-cane purchase flow.
Auth / audit columns on User, location columns on Plant, roles / permissions,
Refund, Staff, Designation, OperatingHours, Lookup tables are deferred to
later versions. Relationships that already exist in target stay wired so
growth is additive.

Naming: table names snake_case plural; class names PascalCase singular.
Target ERD uses integer PKs everywhere — we follow that, except for
`PurchaseGroup` (V1.1-internal grouping of multi-cane orders) which uses a
UUID so external URLs are opaque. PurchaseGroup will formalise into target's
PurchaseTap entity in a later version.
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
    pass


# ---------------------------------------------------------------------------
# Pricing & limits (time-series; customer_type references the current row)
# ---------------------------------------------------------------------------

class Price(Base):
    __tablename__ = "prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    currency: Mapped[str] = mapped_column(String(8), default="PKR")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)


class Limit(Base):
    __tablename__ = "limits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    daily_litre_limit: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)


class CustomerType(Base):
    __tablename__ = "customer_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    price_id: Mapped[int] = mapped_column(ForeignKey("prices.id"))
    limit_id: Mapped[int] = mapped_column(ForeignKey("limits.id"))

    price: Mapped[Price] = relationship(foreign_keys=[price_id])
    limit: Mapped[Limit] = relationship(foreign_keys=[limit_id])


# ---------------------------------------------------------------------------
# User & customer
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(128), unique=True)
    first_name: Mapped[str] = mapped_column(String(64))
    last_name: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["Customer"] = relationship(back_populates="user", uselist=False)


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    customer_type_id: Mapped[int] = mapped_column(ForeignKey("customer_types.id"))

    user: Mapped[User] = relationship(back_populates="customer")
    customer_type: Mapped[CustomerType] = relationship()


# ---------------------------------------------------------------------------
# Plant / Controller / Tap
# ---------------------------------------------------------------------------

class PlantStatus(str, enum.Enum):
    operational = "operational"
    under_review = "under_review"
    maintenance = "maintenance"


class Plant(Base):
    __tablename__ = "plants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128))
    status: Mapped[PlantStatus] = mapped_column(
        SAEnum(PlantStatus, name="plant_status"), default=PlantStatus.under_review
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    controllers: Mapped[list["Controller"]] = relationship(back_populates="plant", order_by="Controller.id")
    taps: Mapped[list["Tap"]] = relationship(back_populates="plant", order_by="Tap.id")


class ControllerStatus(str, enum.Enum):
    operational = "operational"
    maintenance = "maintenance"


class Controller(Base):
    __tablename__ = "controllers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    status: Mapped[ControllerStatus] = mapped_column(
        SAEnum(ControllerStatus, name="controller_status"), default=ControllerStatus.operational
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)

    plant: Mapped[Plant] = relationship(back_populates="controllers")
    taps: Mapped[list["Tap"]] = relationship(back_populates="controller", order_by="Tap.id")


class TapStatus(str, enum.Enum):
    operational = "operational"
    maintenance = "maintenance"


class Tap(Base):
    __tablename__ = "taps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    controller_id: Mapped[int] = mapped_column(ForeignKey("controllers.id"))
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id"))
    gpio_pin_number: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[TapStatus] = mapped_column(
        SAEnum(TapStatus, name="tap_status"), default=TapStatus.operational
    )
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    label: Mapped[str] = mapped_column(String(64))  # human label for UI; not in target but cheap

    controller: Mapped[Controller] = relationship(back_populates="taps")
    plant: Mapped[Plant] = relationship(back_populates="taps")


# ---------------------------------------------------------------------------
# Purchase (one row per cane) + PurchaseGroup (V1.1 order)
# ---------------------------------------------------------------------------

class PurchaseGroupStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class PurchaseStatus(str, enum.Enum):
    pending = "pending"
    started = "started"
    completed = "completed"
    partial_completed = "partial_completed"  # aligns with target's PARTIAL_COMPLETED
    failed = "failed"
    cancelled = "cancelled"


class PurchaseGroup(Base):
    """Per-order grouping of multi-cane purchases. Not in target schema yet
    (target entity #19 `PurchaseTap` will formalise). External URLs use the
    uuid so id churn stays private."""

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
    """One cane = one Purchase row (matches target). Price/Limit FK snapshot
    the customer_type's current Price/Limit at purchase time so history isn't
    lost when rates change."""

    __tablename__ = "purchases"
    __table_args__ = (
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
    litres_count: Mapped[Decimal] = mapped_column(Numeric(10, 2))  # requested litres
    litres_delivered: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    # Runtime-only fields on the Purchase row (V1.1 — kept here for simplicity
    # rather than a sidecar state table):
    cane_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[PurchaseStatus] = mapped_column(
        SAEnum(PurchaseStatus, name="purchase_status"), default=PurchaseStatus.pending
    )
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    retry_window_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(256), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    group: Mapped[PurchaseGroup] = relationship(back_populates="purchases")
    price: Mapped[Price] = relationship(foreign_keys=[price_id])
    limit: Mapped[Limit] = relationship(foreign_keys=[limit_id])
    tap: Mapped[Tap] = relationship()


# ---------------------------------------------------------------------------
# Wallet ledger
# ---------------------------------------------------------------------------

class WalletTransactionType(str, enum.Enum):
    credit = "credit"  # deposits
    debit = "debit"    # purchases


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    transaction_type: Mapped[WalletTransactionType] = mapped_column(
        SAEnum(WalletTransactionType, name="wallet_transaction_type"),
        default=WalletTransactionType.debit,
    )
    # Link to the purchase that drove this debit (optional — deposits have none).
    purchase_id: Mapped[int | None] = mapped_column(ForeignKey("purchases.id"), nullable=True)
