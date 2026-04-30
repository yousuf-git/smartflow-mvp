"""
Authentication & Authorization Services

This module provides the security layer for the application. it handles 
password hashing using Bcrypt, JWT (JSON Web Token) generation and 
verification, and defines FastAPI dependencies for securing endpoints 
based on user identity and roles.

Key Functions:
- hash_password / verify_password: Secure credential management.
- create_access_token: Generates short-lived or long-lived JWTs.
- get_current_user: The primary dependency for extracting the user from a request.
- require_role: A factory for creating role-restricted access guards.

Connections:
- Used by: app.routes_auth (login/signup) and all protected routes.
- Dependencies: app.config (JWT_SECRET), app.db (AsyncSession), app.models (User).
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_sessionmaker
from app.models import User, UserRole

# OAuth2 standard for token-based authentication. 
# Points to the login endpoint where the frontend should exchange credentials for a token.
_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(plain: str) -> str:
    """
    Hashes a plain-text password using a secure salt.
    """
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verifies if a plain-text password matches a previously hashed version.
    """
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: int, role: str, settings: Settings, expire_minutes: int | None = None) -> str:
    """
    Creates a signed JWT for a specific user.
    
    Args:
        user_id: The primary key of the user.
        role: The user's role (admin, manager, customer).
        settings: Global application settings for the secret key.
        expire_minutes: Optional override for token expiration.
        
    Returns:
        An encoded JWT string.
    """
    minutes = expire_minutes or settings.JWT_EXPIRE_MINUTES
    payload = {
        "sub": str(user_id), # Subject (User ID)
        "role": role,        # Claims (Role)
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


async def _db_session():
    """
    Internal dependency for providing a database session within auth functions.
    """
    sm = get_sessionmaker()
    async with sm() as session:
        yield session


async def get_current_user(
    token: str = Depends(_oauth2),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(_db_session),
) -> User:
    """
    FastAPI dependency that validates the JWT and returns the associated User model.
    
    Logic:
    1. Decodes the token using the system's JWT_SECRET.
    2. Extracts the user ID from the 'sub' claim.
    3. Fetches the user from the database.
    4. Validates that the user is active and not deleted.
    
    Raises:
        HTTPException(401): If the token is invalid or the user is not found/inactive.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="invalid_token")

    user = await session.get(User, user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="user_not_found")
    return user


def require_role(*roles: UserRole):
    """
    Factory for creating a role-restricted dependency.
    
    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_role(UserRole.admin))])
        async def admin_only_endpoint(): ...
        
    Args:
        *roles: One or more UserRole enums that are permitted to access the route.
    """
    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="insufficient_permissions")
        return user
    return _check
