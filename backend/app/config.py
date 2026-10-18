"""Application configuration.

All settings are environment-overridable. The app is designed so the entire
deterministic layer (fund search + NAV + quantitative metrics) works with zero
external credentials. Only the LLM reasoning nodes need an Anthropic API key;
when it is absent the agent degrades gracefully to a deterministic narrative.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
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

    # --- CAS statement import: freshness policy ---
    cas_warn_days: int = 30
    cas_reject_days: int = 90
    cas_max_bytes: int = 15_000_000

    # --- LLM (multi-provider reasoning layer: narrative, research, insights, market) ---
    # Provider-switchable via LLM_PROVIDER ("anthropic" | "groq"). Keys are read from the
    # standard, un-prefixed names (ANTHROPIC_API_KEY / GROQ_API_KEY) as well as HPR_-prefixed
    # fallbacks, so common env conventions just work.
    llm_provider: str = Field(
        "anthropic", validation_alias=AliasChoices("LLM_PROVIDER", "HPR_LLM_PROVIDER")
    )
    llm_model: str = Field(
        "claude-opus-4-8", validation_alias=AliasChoices("LLM_MODEL", "HPR_LLM_MODEL")
    )
    llm_max_tokens: int = 4096
    anthropic_api_key: str | None = Field(
        None, validation_alias=AliasChoices("ANTHROPIC_API_KEY", "HPR_ANTHROPIC_API_KEY")
    )
    groq_api_key: str | None = Field(
        None, validation_alias=AliasChoices("GROQ_API_KEY", "HPR_GROQ_API_KEY")
    )

    # --- Web search (Tavily) for the evidence-research + market-pulse agents ---
    # Credit-conservative defaults: research is ON-DEMAND (never automatic), uses "basic"
    # depth (1 credit vs 2 for "advanced"), few results, long cache, and a hard daily cap.
    tavily_api_key: str | None = None
    tavily_base: str = "https://api.tavily.com/search"
    search_depth: str = "basic"  # "basic" (1 credit) | "advanced" (2 credits)
    search_max_results: int = 4
    search_ttl_hours: int = 72  # fund facts change slowly — cache hard to avoid re-spending
    search_daily_cap: int = 60  # safety valve: max Tavily network calls per day, app-wide
    portfolio_chat_daily_cap: int = 100  # in-process cap on LLM-backed portfolio questions

    @property
    def is_groq(self) -> bool:
        return self.llm_provider.strip().lower() == "groq"

    @property
    def active_llm_key(self) -> str | None:
        return self.groq_api_key if self.is_groq else self.anthropic_api_key

    @property
    def llm_enabled(self) -> bool:
        return bool(self.active_llm_key)

    @property
    def search_enabled(self) -> bool:
        return bool(self.tavily_api_key)

    @property
    def research_enabled(self) -> bool:
        # Real web research needs BOTH a search provider and an LLM to judge/extract claims.
        return self.llm_enabled and self.search_enabled


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    return settings
