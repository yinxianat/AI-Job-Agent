from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    APP_ENV: str = "development"
    SECRET_KEY: str = "testing"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Database
    # Railway injects DATABASE_URL as postgres://... or postgresql://...
    # SQLAlchemy async requires the +asyncpg scheme — normalised by validator below.
    DATABASE_URL: str = "sqlite+aiosqlite:///./job_agent.db"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _fix_db_url(cls, v: str) -> str:
        """Rewrite Railway's postgres:// URL to the asyncpg scheme."""
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # AI
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-opus-4-6"

    # Job APIs
    JSEARCH_API_KEY:  str = ""   # RapidAPI key for JSearch (jsearch.p.rapidapi.com)
    USAJOBS_API_KEY:  str = ""   # USAJOBS API key from developer.usajobs.gov
    USAJOBS_USER_AGENT: str = "" # Email address used when registering for USAJOBS API

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SUPPORT_EMAIL: str = "support@jobagent.app"

    # Frontend base URL — used to build password-reset links in emails
    APP_BASE_URL: str = "http://localhost:5173"

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]


settings = Settings()
