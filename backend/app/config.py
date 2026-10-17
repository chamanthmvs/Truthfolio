"""Application configuration.

All settings are environment-overridable. The app is designed so the entire
deterministic layer (fund search + NAV + quantitative metrics) works with zero
external credentials. Only the LLM reasoning nodes need an Anthropic API key;
when it is absent the agent degrades gracefully to a deterministic narrative.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = BASE_DIR / ".cache"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="HPR_", extra="ignore")

    # --- Server ---
    app_name: str = "Truthfolio"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # --- Data sources (all free/public) ---
    amfi_nav_url: str = "https://portal.amfiindia.com/spages/NAVAll.txt"
    mfapi_base: str = "https://api.mfapi.in/mf"
    http_timeout_seconds: float = 20.0

    # --- Caching ---
    cache_dir: Path = CACHE_DIR
    amfi_master_ttl_hours: int = 24
    nav_ttl_hours: int = 12

    # --- Risk-free rate used for Sharpe/Sortino (annualised, India ~ short-term G-Sec) ---
    risk_free_rate: float = 0.065

    # --- LLM (optional; reasoning layer only) ---
    anthropic_api_key: str | None = None
    llm_model: str = "claude-opus-4-8"
    llm_max_tokens: int = 4096

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    return settings
