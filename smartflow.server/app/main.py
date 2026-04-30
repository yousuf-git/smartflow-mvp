import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import dispose_engine, init_engine
from app.mqtt import init_mqtt_client
from app.routes import router
from app.routes_admin import router as admin_router
from app.routes_auth import router as auth_router
from app.routes_customer import router as customer_router
from app.routes_manager import router as manager_router
from app.seed import init_schema_and_seed


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    _configure_logging(settings.LOG_LEVEL)
    init_engine(settings)
    await init_schema_and_seed(settings)
    mqtt = init_mqtt_client(settings)
    await mqtt.start()
    try:
        yield
    finally:
        await mqtt.stop()
        await dispose_engine()


app = FastAPI(title="SmartFlow MVP Server", version="1.2.0", lifespan=lifespan)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(router)
app.include_router(admin_router)
app.include_router(manager_router)
app.include_router(customer_router)


@app.get("/")
async def root():
    return {"service": "smartflow-mvp-server", "version": "1.2.0"}
