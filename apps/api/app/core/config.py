import json
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "tokenwise-super-secret-key-32-chars-long-development"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database: Supports SQLite (aiosqlite) or PostgreSQL (asyncpg)
    DATABASE_URL: str = "sqlite+aiosqlite:///./tokenwise.db"

    # Optional Redis for distributed telemetry queue
    REDIS_URL: str = ""

    # CORS origins
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:8000",
        "*"
    ]

    # Default upstream provider
    OPENAI_API_BASE: str = "https://api.openai.com/v1"
    OPENAI_API_KEY: str = ""

    # OpenRouter Integration
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_TIMEOUT_SECONDS: float = 120.0
    OPENROUTER_SITE_URL: str = "https://tokenwise.ai"
    OPENROUTER_SITE_NAME: str = "TokenWise Observability"

    # Dynamic Catalog & Pricing Synchronization
    TOKENWISE_PRICING_SYNC_ENABLED: bool = True
    TOKENWISE_PRICING_SYNC_INTERVAL_HOURS: int = 24
    TOKENWISE_MODEL_SYNC_INTERVAL_HOURS: int = 24
    TOKENWISE_PROMPT_CAPTURE_ENABLED: bool = True

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            try:
                decoded = json.loads(v)
                if isinstance(decoded, list):
                    return decoded
            except Exception:
                return [i.strip() for i in v.split(",") if i.strip()]
        return v


settings = Settings()
