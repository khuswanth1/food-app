from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-change-me-please-32-bytes-min"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "QuickKart API"
    ENV: str = "development"
    DATABASE_URL: str = "sqlite:///./quickkart.db"
    REDIS_URL: str | None = None
    JWT_SECRET: str = DEV_SECRET
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 60
    REFRESH_TOKEN_DAYS: int = 7
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    SEED_ON_STARTUP: bool = True
    TAX_RATE: float = 0.05
    LOG_LEVEL: str = "INFO"
    # Vendor-uploaded product photos. Use a persistent volume (or object storage) in production.
    UPLOAD_DIR: str = "uploads"
    MAX_IMAGE_MB: int = 3
    # Reverse geocoding for "Use my current location" (OpenStreetMap Nominatim). Empty URL disables it.
    GEOCODER_URL: str = "https://nominatim.openstreetmap.org/reverse"
    GEOCODER_USER_AGENT: str = "QuickKart/1.0 (food delivery demo)"

    # Payments: Razorpay is used when both keys are set; otherwise the built-in mock gateway.
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    PAYMENT_CURRENCY: str = "INR"
    MERCHANT_NAME: str = "QuickKart"

    # Google sign-in (OAuth 2.0 authorization-code flow). Enabled when both client values are set.
    # Named GOOGLE_OAUTH_* (not the generic GOOGLE_CLIENT_ID) so a machine-wide variable from another project
    # can't override backend/.env — real environment variables take precedence over .env.
    # GOOGLE_OAUTH_REDIRECT_URI must exactly match an "Authorized redirect URI" on the Google Cloud OAuth client.
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"
    # Where the browser lands after Google sign-in (the web app's origin).
    FRONTEND_URL: str = "http://localhost:5173"

    @property
    def google_enabled(self) -> bool:
        return bool(self.GOOGLE_OAUTH_CLIENT_ID and self.GOOGLE_OAUTH_CLIENT_SECRET)

    @property
    def payment_provider(self) -> str:
        return "razorpay" if self.RAZORPAY_KEY_ID and self.RAZORPAY_KEY_SECRET else "mock"

    @field_validator("DATABASE_URL")
    @classmethod
    def _psycopg3_driver(cls, v: str) -> str:
        # Managed Postgres providers hand out postgres:// URLs; route them to the installed psycopg 3 driver.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @model_validator(mode="after")
    def _require_real_secret(self):
        if self.ENV == "production" and (self.JWT_SECRET == DEV_SECRET or len(self.JWT_SECRET) < 32):
            raise ValueError("Set a strong JWT_SECRET (32+ chars) in production")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
