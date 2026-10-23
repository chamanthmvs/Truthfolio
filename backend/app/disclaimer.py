"""Canonical disclaimer — the single source of truth for review caveats.

The honest limits of this product must always be shown, worded exactly, and must never be
dropped or softened. Every review path (fund or portfolio, AI-written or deterministic)
builds its caveats from here, so the core disclaimer is guaranteed to appear verbatim
regardless of whether an LLM ran.
"""

from __future__ import annotations

# Non-negotiable core — always present, verbatim, in every review.
CORE_CAVEATS: list[str] = [
    "This is educational analysis, not personalised advice — it can't know your goals, "
    "time horizon, or tax situation.",
    "It's built on past NAV data, and past performance never guarantees future results.",
]

_FUND_EXTRA: list[str] = [
    "It weighs the numbers, not softer signals like a recent manager change, mandate drift, "
    "or a high expense ratio — check those (the Deep Research panel can help) before you act.",
]

_PORTFOLIO_EXTRA: list[str] = [
    "Your return here is the total gain so far, not a yearly rate — we don't ask for your "
    "purchase dates, so we can't annualise it.",
    "Overlap is judged at the fund-category level for now; two funds in the same category "
    "may hold many of the same stocks.",
]


def _merge(base: list[str], extra: list[str] | None) -> list[str]:
    """Fixed `base` first (guaranteed, verbatim), then any novel `extra`, de-duplicated."""
    out = list(base)
    for c in extra or []:
        c = (c or "").strip()
        if c and c not in out:
            out.append(c)
    return out


def fund_caveats(extra: list[str] | None = None) -> list[str]:
    """The fund disclaimer. Any novel `extra` (e.g. LLM-suggested) is appended after the core."""
    return _merge(CORE_CAVEATS + _FUND_EXTRA, extra)


def portfolio_caveats(extra: list[str] | None = None) -> list[str]:
    """The portfolio disclaimer, built from the same guaranteed core."""
    return _merge(CORE_CAVEATS + _PORTFOLIO_EXTRA, extra)
