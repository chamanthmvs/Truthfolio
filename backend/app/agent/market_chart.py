"""Market history + illustrative scenarios — the honest answer to "show me a prediction chart".

A beginner wants to see where the market has been and where it might go. We give them the
first part factually and refuse to fake the second:

  • HISTORY is real. We use a Nifty-50 *index fund's* NAV (free, from mfapi) as a faithful,
    after-cost stand-in for the broad Indian market, rebased to "growth of ₹100" so it reads
    plainly. This is the actual past, not a model.

  • SCENARIOS are honest arithmetic, never forecasts. We grow today's value at three fixed,
    clearly-labelled assumed rates (e.g. 8% / 11% / 14% a year) and say loudly that real markets
    never move in a straight line and that nobody can reliably predict 5–10 year returns. These
    are "what a steady X% would look like", not "what will happen".

This keeps the product's promise: everything shown is either computed from real data or
explicitly labelled as an assumption. Deterministic and free — no LLM, no web search.
"""

from __future__ import annotations

import pandas as pd

from app.config import get_settings
from app.data import amfi, cache, navapi

_CACHE_TTL = 12 * 3600

# Illustrative annual growth rates for the scenario bands. Deliberately round numbers that
# roughly span long-run equity outcomes — chosen as assumptions to reason with, NOT predictions.
_SCENARIOS: list[tuple[str, float, str]] = [
    ("Cautious", 0.08, "If it grew a steady 8% a year"),
    ("Steady", 0.11, "If it grew a steady 11% a year"),
    ("Buoyant", 0.14, "If it grew a steady 14% a year"),
]
_SCENARIO_YEARS = 10

_EXCLUDE = ("next 50", "equal", "value", "momentum", "elss", "tax", "quality", "low vol")


def _round(v: float | None, places: int = 4) -> float | None:
    return None if v is None else round(v, places)


def _resolve_proxy(master: amfi.SchemeMaster) -> amfi.Scheme | None:
    """The configured Nifty-50 index fund, or the longest-named plain equivalent as fallback."""
    code = get_settings().market_proxy_code
    scheme = master.get(code)
    if scheme is not None:
        return scheme
    candidates = [
        s for s in master.schemes
        if "nifty 50" in s.base_name.lower()
        and "index" in s.base_name.lower()
        and s.is_direct and s.is_growth
        and all(term not in s.base_name.lower() for term in _EXCLUDE)
    ]
    candidates.sort(key=lambda s: s.base_name)
    return candidates[0] if candidates else None


def build_scenarios(last_rebased: float, years: int = _SCENARIO_YEARS) -> list[dict]:
    """Pure: grow today's value at each fixed illustrative rate, year by year.

    Deliberately simple compounding — these are 'what a steady X% would look like', not a model
    of how markets actually move. Extracted so the arithmetic is unit-testable on its own.
    """
    scenarios = []
    for label, rate, blurb in _SCENARIOS:
        points = [{"year": yr, "value": round(last_rebased * ((1 + rate) ** yr), 2)}
                  for yr in range(0, years + 1)]
        scenarios.append({"label": label, "cagr": rate, "blurb": blurb, "points": points})
    return scenarios


def _unavailable(reason: str) -> dict:
    return {"available": False, "reason": reason}


async def market_chart() -> dict:
    master = await amfi.get_master()
    proxy = _resolve_proxy(master)
    if proxy is None:
        return _unavailable("No Nifty 50 index fund is available to chart the market.")

    cache_key = f"market_chart_{proxy.code}"
    cached = cache.read(cache_key, _CACHE_TTL)
    if cached is not None:
        return cached

    try:
        nav = await navapi.get_nav_series(proxy.code)
    except Exception:
        return _unavailable("Market history data is unavailable right now.")

    idx = pd.to_datetime([p.on for p in nav.points])
    series = pd.Series([p.nav for p in nav.points], index=idx, dtype="float64")
    series = series[~series.index.duplicated(keep="last")].sort_index()
    monthly = series.resample("MS").last().dropna()
    if len(monthly) < 24:
        return _unavailable("Not enough history to chart the market yet.")

    base = float(monthly.iloc[0])
    last = float(monthly.iloc[-1])
    start_ts, end_ts = monthly.index[0], monthly.index[-1]
    years = (end_ts - start_ts).days / 365.25

    history = [
        {"date": ts.strftime("%Y-%m-%d"), "value": round(float(v) / base * 100.0, 2)}
        for ts, v in monthly.items()
    ]

    def cagr_window(window_years: int) -> float | None:
        target = end_ts - pd.DateOffset(years=window_years)
        past = monthly.loc[:target]
        if past.empty:
            return None
        start_v = float(past.iloc[-1])
        if start_v <= 0:
            return None
        return (last / start_v) ** (1.0 / window_years) - 1.0

    cagr_since = (last / base) ** (1.0 / years) - 1.0 if years > 0 and base > 0 else None
    running_max = monthly.cummax()
    worst_dd = float((monthly / running_max - 1.0).min())

    last_rebased = round(last / base * 100.0, 2)
    scenarios = build_scenarios(last_rebased)

    result = {
        "available": True,
        "proxy": {
            "scheme_name": proxy.base_name or proxy.name,
            "scheme_code": proxy.code,
            "amc": proxy.amc,
            "inception": start_ts.strftime("%Y-%m-%d"),
            "as_of": end_ts.strftime("%Y-%m-%d"),
            "history_years": round(years, 1),
        },
        "history": history,
        "stats": {
            "growth_multiple": round(last / base, 2),
            "cagr_since_inception": _round(cagr_since),
            "cagr_10y": _round(cagr_window(10)),
            "cagr_5y": _round(cagr_window(5)),
            "worst_drawdown": round(worst_dd, 4),
        },
        "scenarios": scenarios,
        "scenario_years": _SCENARIO_YEARS,
        "scenario_note": (
            "These three paths are illustrative arithmetic, not forecasts. Each one simply grows "
            "today's value at a fixed, assumed rate — it is a picture of what a steady return "
            "would look like, not a prediction that it will happen. Real markets never move in a "
            "straight line; they rise and fall sharply along the way, and nobody can reliably "
            "predict 5-to-10-year returns."
        ),
        "disclaimer": (
            "The solid line is real: it is the actual past NAV of a Nifty 50 index fund, a factual "
            "stand-in for the broad Indian market after that fund's costs, shown as the growth of "
            "₹100. Past performance does not guarantee future results. This is educational "
            "analysis, not personalised investment advice."
        ),
    }
    cache.write(cache_key, result)
    return result
