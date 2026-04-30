"""
Authentication & Identity API Endpoints

This module defines the public and protected routes for user management, 
including login, registration (signup), and session identity. It also 
provides public access to customer types for initial onboarding.

Endpoints:
- POST /api/auth/login: Exchanges credentials for a JWT.
- POST /api/auth/signup: Registers a new customer and returns a token.
- GET  /api/auth/customer-types: Public list of available account categories.
- GET  /api/auth/me: Returns the current user's identity details.

Connections:
- Used by: Frontend Auth providers and Signup/Login forms.
- Uses: app.auth, app.models, app.schemas, app.system_log.
"""

import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.config import Settings, get_settings
from app.db import get_sessionmaker
from app.models import Customer, CustomerType, User, UserRole
from app.schemas import AuthUser, CustomerTypePublicOut, LoginIn, LoginOut, SignupIn
from app.system_log import log_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _db_session():
    """Internal dependency for auth-specific DB operations."""
    sm = get_sessionmaker()
    async with sm() as session:
        yield session


@router.post("/login", response_model=LoginOut)
async def login(
    body: LoginIn,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(_db_session),
):
    """
    Authenticates a user and issues a JWT.
    
    Validates:
    - User existence and password matching.
    - Account active status (not disabled or deleted).
    
    Supports 'remember me' for extended session durations.
    """
    user = (
        await session.scalars(select(User).where(User.email == body.email))
    ).one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="account_disabled")

    if user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="account_deleted")

    expire = settings.JWT_REMEMBER_EXPIRE_MINUTES if body.remember_me else None
    token = create_access_token(user.id, user.role.value, settings, expire_minutes=expire)

    await log_event(session, "info", f"User logged in: {user.email}", "auth.login", user.id)
    await session.commit()

    return LoginOut(
        token=token,
        user=AuthUser(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            role=user.role.value,
            phone=user.phone,
        ),
    )


@router.post("/signup", response_model=LoginOut, status_code=201)
async def signup(
    body: SignupIn,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(_db_session),
):
    """
    Registers a new customer.
    
    1. Ensures email uniqueness.
    2. Validates the chosen customer type.
    3. Hashes the password and creates the User/Customer records.
    4. Automatically logs the user in (issues a token).
    """
    existing = (
        await session.scalars(select(User).where(User.email == body.email))
    ).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="email_already_exists")

    ct = await session.get(CustomerType, body.customer_type_id)
    if ct is None or ct.deleted_at is not None:
        raise HTTPException(status_code=400, detail="invalid_customer_type")

    user = User(
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        password_hash=hash_password(body.password),
        role=UserRole.customer,
        phone=body.phone,
    )
    session.add(user)
    await session.flush()

    customer = Customer(user_id=user.id, customer_type_id=ct.id)
    session.add(customer)

    await log_event(session, "info", f"New customer signup: {user.email}", "auth.signup", user.id)
    await session.commit()

    token = create_access_token(user.id, user.role.value, settings)
    return LoginOut(
        token=token,
        user=AuthUser(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            role=user.role.value,
            phone=user.phone,
        ),
    )


@router.get("/customer-types", response_model=list[CustomerTypePublicOut])
async def public_customer_types(
    session: AsyncSession = Depends(_db_session),
):
    """
    Returns a list of customer categories with their pricing and limits.
    Intended for public viewing during the registration process.
    """
    types = (
        await session.scalars(
            select(CustomerType)
            .where(CustomerType.deleted_at.is_(None))
            .options(selectinload(CustomerType.price), selectinload(CustomerType.limit))
        )
    ).all()

    return [
        CustomerTypePublicOut(
            id=ct.id,
            name=ct.name,
            unit_price=float(ct.price.unit_price),
            daily_litre_limit=float(ct.limit.daily_litre_limit),
        )
        for ct in types
    ]


@router.get("/me", response_model=AuthUser)
async def auth_me(user: User = Depends(get_current_user)):
    """
    Identity check endpoint. Returns current authenticated user's metadata.
    """
    return AuthUser(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role.value,
        phone=user.phone,
    )
