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

from functools import lru_cache

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

    # Database Connection String (e.g., postgresql+asyncpg://user:pass@host/db)
    DATABASE_URL: str = ""

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
    DEMO_FIRST_NAME: str = "Yousuf"
    DEMO_LAST_NAME: str = "Ahmed"
    DEMO_CUSTOMER_TYPE: str = "normal"
    INITIAL_BALANCE: float = 500.0

    # Business Logic Constants / Constraints
    ACK_TIMEOUT_SECONDS: float = 5.0    # Wait time for device to acknowledge a START command
    MAX_LITRES: float = 100.0           # Maximum allowed per cane dispense
    IDLE_RELEASE_SECONDS: float = 90.0  # Duration before an inactive order WS is closed
    RETRY_LIMIT: int = 3                # Max retries for starting a dispense
    RETRY_WINDOW_SECONDS: float = 60.0  # Time window for the retry limit

    # System Integration Settings
    CORS_ORIGINS: str = "http://localhost:5173,*"
    LOG_LEVEL: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        """
        Parses the comma-separated CORS_ORIGINS string into a list of strings.
        Used by app.main to configure CORSMiddleware.
        """
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

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
