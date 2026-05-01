import hashlib
import time

import httpx
from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.config import Settings
from app.models import User
from app.schemas import AuthUser, ProfileUpdateIn

MAX_AVATAR_BYTES = 2 * 1024 * 1024


def to_auth_user(user: User) -> AuthUser:
    return AuthUser(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role.value,
        phone=user.phone,
        avatar_url=user.avatar_url,
    )


async def update_profile(
    session: AsyncSession,
    user: User,
    body: ProfileUpdateIn,
) -> AuthUser:
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

    await session.commit()
    await session.refresh(db_user)
    return to_auth_user(db_user)


async def upload_avatar(
    session: AsyncSession,
    user: User,
    file: UploadFile,
    settings: Settings,
) -> AuthUser:
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
    await session.commit()
    await session.refresh(db_user)
    return to_auth_user(db_user)
