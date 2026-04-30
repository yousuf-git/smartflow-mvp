from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.config import Settings, get_settings
from app.db import get_sessionmaker
from app.models import User
from app.schemas import AuthUser, LoginIn, LoginOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _db_session():
    sm = get_sessionmaker()
    async with sm() as session:
        yield session


@router.post("/login", response_model=LoginOut)
async def login(
    body: LoginIn,
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(_db_session),
):
    user = (
        await session.scalars(select(User).where(User.email == body.email))
    ).one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="account_disabled")

    token = create_access_token(user.id, user.role.value, settings)
    return LoginOut(
        token=token,
        user=AuthUser(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            role=user.role.value,
        ),
    )


@router.get("/me", response_model=AuthUser)
async def auth_me(user: User = Depends(get_current_user)):
    return AuthUser(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role.value,
    )
