"""
SmartFlow MVP Server Entry Point

This module initializes the FastAPI application, sets up global middleware, 
configures logging, and orchestrates the lifecycle of external services 
(Database and MQTT). It acts as the central hub where all sub-routers 
(Auth, Admin, Manager, Customer) are registered.

Connections:
- Used by: Uvicorn or Gunicorn to serve the application.
- Uses: app.config, app.db, app.mqtt, and various app.routes modules.
"""

import logging
import platform
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.config import get_settings
from app.db import dispose_engine, get_engine, init_engine
from app.mqtt import init_mqtt_client
from app.routes import router
from app.routes_admin import router as admin_router
from app.routes_auth import router as auth_router
from app.routes_customer import router as customer_router
from app.routes_locations import router as locations_router
from app.routes_manager import router as manager_router
from app.seed import init_schema_and_seed

_start_time: float = 0.0
_start_dt: datetime | None = None
_mqtt_ref = None


def _configure_logging(level: str) -> None:
    """
    Configures the global logging format and level.
    
    Args:
        level: The logging level string (e.g., 'INFO', 'DEBUG') sourced from settings.
    """
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the application lifecycle (startup and shutdown).
    
    Startup logic:
    1. Loads application settings.
    2. Configures logging.
    3. Initializes the SQLAlchemy async engine.
    4. Ensures the database schema is up-to-date and seeds initial data if needed.
    5. Starts the MQTT client to listen for IoT device messages.
    
    Shutdown logic:
    1. Gracefully stops the MQTT loop.
    2. Disposes of the database engine to clean up connection pools.
    """
    global _start_time, _start_dt, _mqtt_ref
    settings = get_settings()
    _configure_logging(settings.LOG_LEVEL)
    settings.materialize_certs()
    init_engine(settings)
    await init_schema_and_seed(settings)
    mqtt = init_mqtt_client(settings)
    _mqtt_ref = mqtt
    await mqtt.start()
    _start_time = time.monotonic()
    _start_dt = datetime.now(timezone.utc)
    try:
        yield
    finally:
        await mqtt.stop()
        await dispose_engine()


# Initialize FastAPI app with metadata and lifecycle management
app = FastAPI(title="SmartFlow MVP Server", version="1.2.0", lifespan=lifespan)

_settings = get_settings()

_cors_origins = _settings.cors_origin_list
_wildcard = "*" in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _wildcard else _cors_origins,
    allow_credentials=not _wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route Registration: Distinguishes between public, auth, and role-specific endpoints.
app.include_router(auth_router)      # /api/auth/*
app.include_router(router)           # /api/* (generic/system)
app.include_router(admin_router)     # /api/admin/*
app.include_router(manager_router)   # /api/manager/*
app.include_router(customer_router)  # /api/customer/*
app.include_router(locations_router) # /api/locations/*


_health_html = (Path(__file__).parent / "static" / "health.html").read_text()


@app.get("/", response_class=HTMLResponse)
async def root():
    return _health_html


@app.get("/api/health")
async def health():
    uptime = time.monotonic() - _start_time

    db_status = "connected"
    try:
        from sqlalchemy import text
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_status = "disconnected"

    mqtt_status = "not_configured"
    if _mqtt_ref:
        mqtt_status = "connected" if _mqtt_ref.connected else "disconnected"

    is_heroku = bool(__import__("os").environ.get("DYNO"))

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "version": app.version,
        "uptime_seconds": int(uptime),
        "started_at": _start_dt.isoformat() if _start_dt else None,
        "database": db_status,
        "mqtt": mqtt_status,
        "environment": "heroku" if is_heroku else "local",
        "python_version": platform.python_version(),
    }
