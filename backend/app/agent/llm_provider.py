"""Provider-agnostic chat-model factory.

One place that knows which LLM backend is active (Claude via Anthropic, or an open model via
Groq). Every agent asks here for a model instead of importing a provider directly, so the
whole project switches with a single `LLM_PROVIDER` env var and no code changes.
"""

from __future__ import annotations

from typing import Any

from app.config import get_settings


def get_chat_model(*, temperature: float = 0.2, max_tokens: int | None = None) -> Any:
    """Return a LangChain chat model for the configured provider.

    Raises RuntimeError if the active provider has no key — callers already guard on
    `settings.llm_enabled`, so this only trips on misconfiguration.
    """
    s = get_settings()
    tokens = max_tokens or s.llm_max_tokens
    if not s.llm_enabled:
        raise RuntimeError(f"LLM provider '{s.llm_provider}' has no API key configured.")

    if s.is_groq:
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=s.llm_model,
            api_key=s.groq_api_key,
            temperature=temperature,
            max_tokens=tokens,
        )

    from langchain_anthropic import ChatAnthropic

    # Newer Anthropic models reject an explicit `temperature`, so we don't send one.
    return ChatAnthropic(
        model=s.llm_model,
        api_key=s.anthropic_api_key,
        max_tokens=tokens,
    )


def provider_label() -> str:
    """Human-readable label for the UI / telemetry (e.g. 'Claude', 'Groq')."""
    s = get_settings()
    return "Groq" if s.is_groq else "Claude"
