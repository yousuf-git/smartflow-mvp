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

import hashlib
import logging
import time
from decimal import Decimal

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
from app.schemas import AuthUser, CustomerTypePublicOut, LoginIn, LoginOut, ProfileUpdateIn, SignupIn
from app.system_log import log_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
MAX_AVATAR_BYTES = 2 * 1024 * 1024


async def _db_session():
    """Internal dependency for auth-specific DB operations."""
    sm = get_sessionmaker()
    async with sm() as session:
        yield session


def _auth_user(user: User) -> AuthUser:
    return AuthUser(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role.value,
        phone=user.phone,
        avatar_url=user.avatar_url,
    )


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

    return LoginOut(token=token, user=_auth_user(user))


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
    return LoginOut(token=token, user=_auth_user(user))


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
            description=ct.description,
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
    return _auth_user(user)


@router.put("/profile", response_model=AuthUser)
async def update_own_profile(
    body: ProfileUpdateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(_db_session),
):
    """Updates the signed-in user's own profile."""
    db_user = await session.get(User, user.id)
    if db_user is None or db_user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="user_not_found")

    if body.first_name is not None:
        db_user.first_name = body.first_name.strip()
    if body.last_name is not None:
        db_user.last_name = body.last_name.strip()
    if body.email is not None and body.email.strip() != db_user.email:
        email = body.email.strip()
        duplicate = (await session.scalars(select(User).where(User.email == email))).one_or_none()
        if duplicate:
            raise HTTPException(status_code=409, detail="email_already_exists")
        db_user.email = email
    if body.phone is not None:
        db_user.phone = body.phone.strip() or None
    if body.password:
        db_user.password_hash = hash_password(body.password)

    await log_event(session, "info", f"User updated own profile: {db_user.email}", "auth.profile", db_user.id)
    await session.commit()
    return _auth_user(db_user)


@router.post("/profile/avatar", response_model=AuthUser)
async def upload_own_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(_db_session),
):
    """Uploads a validated avatar image to Cloudinary and stores the secure URL."""
    if not (
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    ):
        raise HTTPException(status_code=503, detail="cloudinary_not_configured")

    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(status_code=400, detail="avatar_invalid_type")

    content = await file.read(MAX_AVATAR_BYTES + 1)
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="avatar_too_large")

    timestamp = str(int(time.time()))
    folder = "smartflow/avatars"
    public_id = f"user_{user.id}_{timestamp}"
    signature_payload = f"folder={folder}&public_id={public_id}&timestamp={timestamp}{settings.CLOUDINARY_API_SECRET}"
    signature = hashlib.sha1(signature_payload.encode("utf-8")).hexdigest()

    upload_url = f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}/image/upload"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            upload_url,
            data={
                "api_key": settings.CLOUDINARY_API_KEY,
                "timestamp": timestamp,
                "folder": folder,
                "public_id": public_id,
                "signature": signature,
            },
            files={"file": (file.filename or "avatar.png", content, file.content_type)},
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="cloudinary_upload_failed")

    secure_url = response.json().get("secure_url")
    if not secure_url:
        raise HTTPException(status_code=502, detail="cloudinary_url_missing")

    db_user = await session.get(User, user.id)
    if db_user is None or db_user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="user_not_found")
    db_user.avatar_url = secure_url
    await log_event(session, "info", f"User updated avatar: {db_user.email}", "auth.profile.avatar", db_user.id)
    await session.commit()
    return _auth_user(db_user)
