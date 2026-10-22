"""Fund NAV history, rebased to 'growth of ₹100' — the factual growth curve for a review.

Same honest footing as the market chart: everything here is the fund's real, after-cost NAV
(from mfapi), resampled monthly and rebased so it reads as "₹100 at the start became ₹X".
Deterministic and free — no LLM, no web search, no forecasts.
"""

from __future__ import annotations

import pandas as pd

from app.data import amfi, cache, navapi

_CACHE_TTL = 12 * 3600


def _round(v: float | None, places: int = 4) -> float | None:
    return None if v is None else round(v, places)


async def fund_history(scheme_code: str) -> dict:
    master = await amfi.get_master()
    scheme = master.get(scheme_code)
    if scheme is None:
        return {"available": False, "reason": "Fund not found."}

    cache_key = f"fund_history_{scheme_code}"
    cached = cache.read(cache_key, _CACHE_TTL)
    if cached is not None:
        return cached

    try:
        nav = await navapi.get_nav_series(scheme_code)
    except Exception:
        return {"available": False, "reason": "History data is unavailable right now."}

    idx = pd.to_datetime([p.on for p in nav.points])
    series = pd.Series([p.nav for p in nav.points], index=idx, dtype="float64")
    series = series[~series.index.duplicated(keep="last")].sort_index()
    monthly = series.resample("MS").last().dropna()
    if len(monthly) < 12:
        return {"available": False, "reason": "Not enough history to chart yet."}

    base = float(monthly.iloc[0])
    last = float(monthly.iloc[-1])
    start_ts, end_ts = monthly.index[0], monthly.index[-1]
    years = (end_ts - start_ts).days / 365.25
    if base <= 0:
        return {"available": False, "reason": "History data is unavailable right now."}

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
        return (last / start_v) ** (1.0 / window_years) - 1.0 if start_v > 0 else None

    running_max = monthly.cummax()
    worst_dd = float((monthly / running_max - 1.0).min())

    result = {
        "available": True,
        "scheme_name": scheme.base_name or scheme.name,
        "inception": start_ts.strftime("%Y-%m-%d"),
        "as_of": end_ts.strftime("%Y-%m-%d"),
        "history_years": round(years, 1),
        "history": history,
        "stats": {
            "growth_multiple": round(last / base, 2),
            "cagr_since_inception": _round((last / base) ** (1.0 / years) - 1.0) if years > 0 else None,
            "cagr_5y": _round(cagr_window(5)),
            "worst_drawdown": round(worst_dd, 4),
        },
        "disclaimer": (
            "This is the fund's actual past NAV, shown as the growth of ₹100 after the fund's "
            "costs. Past performance does not guarantee future results."
        ),
    }
    cache.write(cache_key, result)
    return result
