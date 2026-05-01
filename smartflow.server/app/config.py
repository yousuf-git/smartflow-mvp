"""
Application Configuration Management

This module defines the global settings for the SmartFlow MVP Server using 
Pydantic Settings. It centralizes environment variables, including 
database credentials, AWS IoT connection details, JWT security parameters, 
and initial seed data for demo environments.

The `Settings` class automatically loads values from a `.env` file if present, 
mapping them to typed attributes.

Connections:
- Used by: Almost every module in the application to access runtime constants.
"""

import base64
import tempfile
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Schema for application configuration.
    
    Attributes are populated from environment variables (case-insensitive).
    Defaults are provided for development convenience but should be 
    overridden in production via .env or system environment.
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # AWS IoT Core Connection Parameters
    # Used by app.mqtt to establish a secure TLS connection with the AWS IoT broker.
    AWS_IOT_ENDPOINT: str = ""
    AWS_IOT_PORT: int = 8883
    AWS_IOT_CLIENT_ID: str = "smartflow-server-v1"
    AWS_IOT_CA_PATH: str = ""
    AWS_IOT_CERT_PATH: str = ""
    AWS_IOT_KEY_PATH: str = ""
    AWS_IOT_CA_B64: str = ""
    AWS_IOT_CERT_B64: str = ""
    AWS_IOT_KEY_B64: str = ""

    # Database Connection String (e.g., postgresql+asyncpg://user:pass@host/db)
    DATABASE_URL: str = ""

    @property
    def async_database_url(self) -> str:
        """Heroku gives postgres://, asyncpg needs postgresql+asyncpg://."""
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    # Infrastructure Seed Defaults
    # Used by app.seed to populate the DB with a default plant and controller if empty.
    PLANT_NAME: str = "Demo Plant"
    CONTROLLER_NAME: str = "DEV-001"  # Matches the MQTT topic suffix used by the IoT device
    TAPS: str = "T1:Tap 1,T2:Tap 2"   # Format: "CODE:LABEL,CODE:LABEL"

    # JWT Security Settings
    # JWT_SECRET must be kept private and rotated in production.
    JWT_SECRET: str = "smartflow-mvp-dev-secret-change-in-prod"
    JWT_EXPIRE_MINUTES: int = 480               # Standard session (8 hours)
    JWT_REMEMBER_EXPIRE_MINUTES: int = 43200    # Extended session (30 days)

    # Initial Administrative User Seed
    ADMIN_EMAIL: str = "admin@smartflow.com"
    ADMIN_PASSWORD: str = "admin123"
    ADMIN_FIRST_NAME: str = "Admin"
    ADMIN_LAST_NAME: str = "User"

    # Initial Manager User Seed
    MANAGER_EMAIL: str = "manager@smartflow.com"
    MANAGER_PASSWORD: str = "manager123"
    MANAGER_FIRST_NAME: str = "Manager"
    MANAGER_LAST_NAME: str = "User"

    # Initial Demo Customer User Seed
    DEMO_EMAIL: str = "yousuf@smartflow.com"
    DEMO_PASSWORD: str = "demo123"
    DEMO_FIRST_NAME: str = "Muhammad"
    DEMO_LAST_NAME: str = "Yousuf"
    DEMO_CUSTOMER_TYPE: str = "normal"
    INITIAL_BALANCE: float = 500.0

    # Business Logic Constants / Constraints
    ACK_TIMEOUT_SECONDS: float = 15.0   # Wait time for device to acknowledge a START command
    MAX_LITRES: float = 100.0           # Maximum allowed per cane dispense
    IDLE_RELEASE_SECONDS: float = 90.0  # Duration before an inactive order WS is closed
    RETRY_LIMIT: int = 3                # Max retries for starting a dispense
    RETRY_WINDOW_SECONDS: float = 60.0  # Time window for the retry limit

    # System Integration Settings
    CORS_ORIGINS: str = "http://localhost:5173,*"
    LOG_LEVEL: str = "INFO"
    CSC_API_KEY: str = ""
    CSC_API_BASE_URL: str = "https://api.countrystatecity.in/v1"
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        """
        Parses the comma-separated CORS_ORIGINS string into a list of strings.
        Used by app.main to configure CORSMiddleware.
        """
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    def materialize_certs(self) -> None:
        """Decode base64 cert env vars to temp files if paths not already set."""
        if self.AWS_IOT_CA_PATH and Path(self.AWS_IOT_CA_PATH).exists():
            return
        pairs = [
            ("AWS_IOT_CA_B64", "AWS_IOT_CA_PATH", "ca.pem"),
            ("AWS_IOT_CERT_B64", "AWS_IOT_CERT_PATH", "cert.pem"),
            ("AWS_IOT_KEY_B64", "AWS_IOT_KEY_PATH", "key.pem"),
        ]
        for b64_attr, path_attr, filename in pairs:
            b64_val = getattr(self, b64_attr)
            if not b64_val:
                continue
            cert_dir = Path(tempfile.gettempdir()) / "smartflow-certs"
            cert_dir.mkdir(exist_ok=True)
            cert_file = cert_dir / filename
            cert_file.write_bytes(base64.b64decode(b64_val))
            cert_file.chmod(0o600)
            object.__setattr__(self, path_attr, str(cert_file))

    @property
    def mqtt_configured(self) -> bool:
        """
        Validates if all required AWS IoT credentials and endpoints are provided.
        If False, the MQTT loop in app.mqtt will not start.
        """
        return bool(
            self.AWS_IOT_ENDPOINT
            and self.AWS_IOT_CA_PATH
            and self.AWS_IOT_CERT_PATH
            and self.AWS_IOT_KEY_PATH
        )

    @property
    def taps_parsed(self) -> list[tuple[str, str]]:
        """
        Parses the TAPS configuration string into a structured list.
        Example: "T1:Tap 1,T2:Tap 2" -> [("T1", "Tap 1"), ("T2", "Tap 2")]
        Used during database seeding.
        """
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
    """
    Returns a cached instance of the Settings class.
    Ensures .env is only read once during the application lifetime.
    """
    return Settings()
