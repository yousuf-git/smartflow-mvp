"""
Cached Country State City location proxy for Pakistan.

The CSC API requires an API key in the X-CSCAPI-KEY header, so requests are
proxied through the backend instead of exposing the key to browser code.
"""

import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_role
from app.config import Settings, get_settings
from app.models import User, UserRole

router = APIRouter(prefix="/api/locations", tags=["locations"])

COUNTRY_ISO2 = "PK"
CACHE_TTL_SECONDS = 60 * 60 * 24
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}

_FALLBACK_STATES = [
    {"id": 3176, "name": "Azad Kashmir", "iso2": "JK"},
    {"id": 3177, "name": "Balochistan", "iso2": "BA"},
    {"id": 3178, "name": "Gilgit-Baltistan", "iso2": "GB"},
    {"id": 3179, "name": "Islamabad Capital Territory", "iso2": "IS"},
    {"id": 3180, "name": "Khyber Pakhtunkhwa", "iso2": "KP"},
    {"id": 3181, "name": "Punjab", "iso2": "PB"},
    {"id": 3182, "name": "Sindh", "iso2": "SD"},
]

_FALLBACK_CITIES = {
    "JK": ["Muzaffarabad", "Mirpur", "Kotli"],
    "BA": ["Quetta", "Gwadar", "Turbat"],
    "GB": ["Gilgit", "Skardu", "Hunza"],
    "IS": ["Islamabad"],
    "KP": ["Peshawar", "Mardan", "Abbottabad", "Swat"],
    "PB": ["Lahore", "Faisalabad", "Rawalpindi", "Multan", "Gujranwala", "Sialkot"],
    "SD": ["Karachi", "Hyderabad", "Sukkur", "Larkana"],
}


def _from_cache(key: str) -> list[dict[str, Any]] | None:
    hit = _cache.get(key)
    if not hit:
        return None
    expires_at, data = hit
    if expires_at < time.time():
        _cache.pop(key, None)
        return None
    return data


def _store_cache(key: str, data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    _cache[key] = (time.time() + CACHE_TTL_SECONDS, data)
    return data


def _normalise_rows(payload: Any) -> list[dict[str, Any]]:
    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return []
    return [
        {
            "id": row.get("id"),
            "name": row.get("name", ""),
            "iso2": row.get("iso2"),
        }
        for row in rows
        if isinstance(row, dict) and row.get("name")
    ]


async def _csc_get(settings: Settings, path: str) -> list[dict[str, Any]]:
    if not settings.CSC_API_KEY:
        raise HTTPException(status_code=503, detail="csc_api_key_missing")

    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.get(
            f"{settings.CSC_API_BASE_URL.rstrip('/')}{path}",
            headers={"X-CSCAPI-KEY": settings.CSC_API_KEY},
        )
    if response.status_code == 401:
        raise HTTPException(status_code=502, detail="csc_api_unauthorized")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="csc_api_failed")
    return _normalise_rows(response.json())


@router.get("/states")
async def pakistan_states(
    _user: User = Depends(require_role(UserRole.admin, UserRole.manager)),
    settings: Settings = Depends(get_settings),
):
    cache_key = "states:PK"
    cached = _from_cache(cache_key)
    if cached is not None:
        return cached
    if not settings.CSC_API_KEY:
        return _store_cache(cache_key, _FALLBACK_STATES)
    return _store_cache(cache_key, await _csc_get(settings, f"/countries/{COUNTRY_ISO2}/states"))


@router.get("/states/{state_iso2}/cities")
async def pakistan_cities_by_state(
    state_iso2: str,
    _user: User = Depends(require_role(UserRole.admin, UserRole.manager)),
    settings: Settings = Depends(get_settings),
):
    code = state_iso2.upper()
    cache_key = f"cities:PK:{code}"
    cached = _from_cache(cache_key)
    if cached is not None:
        return cached
    if not settings.CSC_API_KEY:
        rows = [{"id": i + 1, "name": name, "iso2": None} for i, name in enumerate(_FALLBACK_CITIES.get(code, []))]
        return _store_cache(cache_key, rows)
    return _store_cache(cache_key, await _csc_get(settings, f"/countries/{COUNTRY_ISO2}/states/{code}/cities"))
