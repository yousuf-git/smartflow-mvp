from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # AWS IoT
    AWS_IOT_ENDPOINT: str = ""
    AWS_IOT_PORT: int = 8883
    AWS_IOT_CLIENT_ID: str = "smartflow-server-v1"
    AWS_IOT_CA_PATH: str = ""
    AWS_IOT_CERT_PATH: str = ""
    AWS_IOT_KEY_PATH: str = ""

    # Database
    DATABASE_URL: str = ""

    # Plant / controller / tap seed
    PLANT_NAME: str = "Demo Plant"
    CONTROLLER_NAME: str = "DEV-001"  # also the MQTT topic key
    TAPS: str = "T1:Tap 1,T2:Tap 2"

    # JWT
    JWT_SECRET: str = "smartflow-mvp-dev-secret-change-in-prod"
    JWT_EXPIRE_MINUTES: int = 480

    # Admin seed
    ADMIN_EMAIL: str = "admin@smartflow.local"
    ADMIN_PASSWORD: str = "admin123"
    ADMIN_FIRST_NAME: str = "Admin"
    ADMIN_LAST_NAME: str = "User"

    # Manager seed
    MANAGER_EMAIL: str = "manager@smartflow.local"
    MANAGER_PASSWORD: str = "manager123"
    MANAGER_FIRST_NAME: str = "Manager"
    MANAGER_LAST_NAME: str = "User"

    # Demo customer seed
    DEMO_EMAIL: str = "demo@smartflow.local"
    DEMO_PASSWORD: str = "demo123"
    DEMO_FIRST_NAME: str = "Demo"
    DEMO_LAST_NAME: str = "User"
    DEMO_CUSTOMER_TYPE: str = "normal"
    INITIAL_BALANCE: float = 500.0

    # Dispense limits
    ACK_TIMEOUT_SECONDS: float = 5.0
    MAX_LITRES: float = 100.0
    IDLE_RELEASE_SECONDS: float = 90.0
    RETRY_LIMIT: int = 3
    RETRY_WINDOW_SECONDS: float = 60.0

    CORS_ORIGINS: str = "http://localhost:5173"
    LOG_LEVEL: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def mqtt_configured(self) -> bool:
        return bool(
            self.AWS_IOT_ENDPOINT
            and self.AWS_IOT_CA_PATH
            and self.AWS_IOT_CERT_PATH
            and self.AWS_IOT_KEY_PATH
        )

    @property
    def taps_parsed(self) -> list[tuple[str, str]]:
        """Return [(code, label), …] parsed from TAPS env (e.g. "T1:Tap 1,T2:Tap 2")."""
        out: list[tuple[str, str]] = []
        for chunk in self.TAPS.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            if ":" in chunk:
                code, label = chunk.split(":", 1)
                out.append((code.strip(), label.strip()))
            else:
                out.append((chunk, chunk))
        return out


@lru_cache
def get_settings() -> Settings:
    return Settings()
