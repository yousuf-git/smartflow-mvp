from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    AWS_IOT_ENDPOINT: str = ""
    AWS_IOT_PORT: int = 8883
    AWS_IOT_CLIENT_ID: str = "smartflow-server-v1"
    AWS_IOT_CA_PATH: str = ""
    AWS_IOT_CERT_PATH: str = ""
    AWS_IOT_KEY_PATH: str = ""

    DEVICE_ID: str = "DEV-001"
    ACK_TIMEOUT_SECONDS: float = 5.0
    MAX_LITRES: float = 100.0

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
