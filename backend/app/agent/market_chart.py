"""Market segments: real history across the market + an honest, numbers-only read.

A beginner wants to see where the market has been, how its different parts are doing, and
where it might go. We answer all three truthfully and refuse to fake a forecast:

  • HISTORY is real. For each market segment we use a plain, long-running *index fund's* NAV
    (free, from mfapi) as a faithful after-cost stand-in for that slice of the market, shown
    as "growth of ₹100". This is the actual past, not a model. NAVs post end-of-day, so the
    latest point is ~1 trading day behind — we say that plainly.

  • THE READ is deterministic arithmetic on those NAVs — recent returns per segment and one
    short, plain-English summary of what the numbers show. It is explicitly "a read of the
    numbers", never news-driven sentiment and never a prediction.

  • SCENARIOS (drawn client-side on long views) are honest arithmetic: grow today's value at
    fixed, clearly-labelled assumed rates. "What a steady X% would look like", not a forecast.

Deterministic and free — no LLM, no web search. Works fully with zero API keys.
"""

from __future__ import annotations

import asyncio

import pandas as pd

from app.data import cache, navapi

_CACHE_TTL = 12 * 3600

# The segments we chart, each backed by the longest-running plain, direct-growth index fund
# for that slice of the market (verified against live AMFI/mfapi data). Order = large → broad.
SEGMENTS: list[dict] = [
    {"key": "nifty50", "code": "120716", "label": "Nifty 50",
     "blurb": "The 50 largest companies"},
    {"key": "next50", "code": "143341", "label": "Nifty Next 50",
     "blurb": "The next 50 large companies"},
    {"key": "midcap150", "code": "147622", "label": "Nifty Midcap 150",
     "blurb": "Mid-sized companies"},
    {"key": "smallcap250", "code": "147623", "label": "Nifty Smallcap 250",
     "blurb": "Smaller companies"},
    {"key": "nifty500", "code": "147625", "label": "Nifty 500",
     "blurb": "The broad market"},
]

# Illustrative annual growth rates for the client-side scenario bands — round numbers that
# roughly span long-run equity outcomes, chosen as assumptions to reason with, NOT predictions.
SCENARIO_RATES: list[dict] = [
    {"label": "Cautious", "rate": 0.08},
    {"label": "Steady", "rate": 0.11},
    {"label": "Buoyant", "rate": 0.14},
]
_SCENARIO_YEARS = 10

# Trailing-return windows (calendar days) used for the comparison strip + the read.
_RETURN_WINDOWS: list[tuple[str, int]] = [
    ("m1", 30), ("m3", 91), ("m6", 182), ("y1", 365), ("y3", 365 * 3), ("y5", 365 * 5),
]


def _round(v: float | None, places: int = 4) -> float | None:
    return None if v is None else round(v, places)


def _daily_series(nav) -> pd.Series:
    idx = pd.to_datetime([p.on for p in nav.points])
    s = pd.Series([p.nav for p in nav.points], index=idx, dtype="float64")
    return s[~s.index.duplicated(keep="last")].sort_index()


def _adaptive_points(series: pd.Series) -> pd.Series:
    """Daily resolution for the recent ~13 months, weekly before that.

    Keeps short ranges (1M–1Y) smooth while bounding the payload for long ranges (3Y–Max).
    """
    last = series.index[-1]
    cut = last - pd.Timedelta(days=400)
    recent = series[series.index >= cut]
    older = series[series.index < cut].resample("W-FRI").last().dropna()
    combined = pd.concat([older, recent])
    return combined[~combined.index.duplicated(keep="last")].sort_index()


def _trailing_return(series: pd.Series, days: int) -> float | None:
    """Total return over the trailing window, using the nearest NAV on-or-before the cutoff."""
    last_val = float(series.iloc[-1])
    target = series.index[-1] - pd.Timedelta(days=days)
    past = series.loc[:target]
    if past.empty:
        return None
    start = float(past.iloc[-1])
    if start <= 0:
        return None
    return last_val / start - 1.0


async def _build_segment(seg: dict) -> dict | None:
    try:
        nav = await navapi.get_nav_series(seg["code"])
    except Exception:
        return None
    series = _daily_series(nav)
    if len(series) < 60:
        return None

    base = float(series.iloc[0])
    last = float(series.iloc[-1])
    if base <= 0:
        return None
    start_ts, end_ts = series.index[0], series.index[-1]
    years = (end_ts - start_ts).days / 365.25

    pts = _adaptive_points(series)
    history = [{"d": ts.strftime("%Y-%m-%d"), "v": round(float(v), 4)} for ts, v in pts.items()]

    returns = {k: _round(_trailing_return(series, d)) for k, d in _RETURN_WINDOWS}
    running_max = series.cummax()
    worst_dd = float((series / running_max - 1.0).min())
    cagr_since = (last / base) ** (1.0 / years) - 1.0 if years > 0 else None

    return {
        "key": seg["key"],
        "label": seg["label"],
        "blurb": seg["blurb"],
        "proxy": {
            "scheme_name": nav.scheme_name if hasattr(nav, "scheme_name") else seg["label"],
            "scheme_code": seg["code"],
            "inception": start_ts.strftime("%Y-%m-%d"),
            "as_of": end_ts.strftime("%Y-%m-%d"),
            "history_years": round(years, 1),
        },
        "history": history,
        "stats": {
            "growth_multiple": round(last / base, 2),
            "cagr_since_inception": _round(cagr_since),
            "worst_drawdown": round(worst_dd, 4),
        },
        "returns": returns,
    }


def _pct(v: float | None, d: int = 1) -> str:
    return "—" if v is None else f"{v * 100:+.{d}f}%"


def _market_read(segments: list[dict]) -> dict:
    """A short, factual read of the numbers — no news, no forecast, no jargon scores."""
    by_key = {s["key"]: s for s in segments}

    def r(key: str, window: str) -> float | None:
        s = by_key.get(key)
        return s["returns"].get(window) if s else None

    # Prefer the broad market as the headline; fall back to large-caps.
    broad = r("nifty500", "m3")
    broad_label = "the broad market (Nifty 500)"
    if broad is None:
        broad = r("nifty50", "m3")
        broad_label = "large-caps (Nifty 50)"

    if broad is None:
        return {"label": "Not enough data", "tone": "neutral",
                "sentences": ["There isn't enough recent NAV data to summarise the market yet."]}

    # Mood label purely from the 3-month move of the broad market.
    if broad >= 0.06:
        label, tone = "Broadly rising", "positive"
    elif broad >= 0.015:
        label, tone = "Mild uptrend", "positive"
    elif broad > -0.015:
        label, tone = "Roughly flat", "neutral"
    elif broad > -0.06:
        label, tone = "Mild pullback", "caution"
    else:
        label, tone = "Broad decline", "negative"

    sentences: list[str] = [
        f"Over the past three months, {broad_label} is {_pct(broad)}."
    ]

    # Leadership: biggest vs smallest companies over 3 months.
    large, small = r("nifty50", "m3"), r("smallcap250", "m3")
    if large is not None and small is not None:
        if small - large >= 0.015:
            sentences.append(
                f"Smaller companies (Smallcap 250, {_pct(small)}) outpaced the largest "
                f"(Nifty 50, {_pct(large)}) — a sign of appetite for riskier parts of the market."
            )
        elif large - small >= 0.015:
            sentences.append(
                f"The largest companies (Nifty 50, {_pct(large)}) held up better than smaller "
                f"ones (Smallcap 250, {_pct(small)}) — a more cautious, defensive tone."
            )
        else:
            sentences.append(
                f"Large and small companies moved broadly together "
                f"(Nifty 50 {_pct(large)}, Smallcap 250 {_pct(small)})."
            )

    # One-year context: are the segments broadly up, down, or split?
    y1 = [s["returns"].get("y1") for s in segments if s["returns"].get("y1") is not None]
    if y1:
        up = sum(1 for v in y1 if v > 0)
        if up == len(y1):
            sentences.append("Over the past year, every segment we track is positive.")
        elif up == 0:
            sentences.append("Over the past year, every segment we track is negative.")
        else:
            sentences.append(
                f"Over the past year the picture is mixed — {up} of {len(y1)} segments are positive."
            )

    return {"label": label, "tone": tone, "sentences": sentences}


def _unavailable(reason: str) -> dict:
    return {"available": False, "reason": reason}


async def market_chart() -> dict:
    cache_key = "market_segments_v2_" + "_".join(s["code"] for s in SEGMENTS)
    cached = cache.read(cache_key, _CACHE_TTL)
    if cached is not None:
        return cached

    built = await asyncio.gather(*(_build_segment(s) for s in SEGMENTS))
    segments = [s for s in built if s]
    if not segments:
        return _unavailable("Market history data is unavailable right now.")

    as_of = max(s["proxy"]["as_of"] for s in segments)

    result = {
        "available": True,
        "as_of": as_of,
        "segments": segments,
        "read": _market_read(segments),
        "scenario_rates": SCENARIO_RATES,
        "scenario_years": _SCENARIO_YEARS,
        "read_note": (
            "A plain read of the numbers — recent returns computed from each segment's index-fund "
            "NAV. It describes what has already happened, not news and not a prediction."
        ),
        "disclaimer": (
            "Each line is real: the actual past NAV of a plain index fund, a faithful after-cost "
            "stand-in for that part of the Indian market, shown as the growth of ₹100. NAVs post "
            "end-of-day, so the latest point is about one trading day behind — this is not a live "
            "index level. Past performance does not guarantee future results. Educational "
            "analysis, not personalised investment advice."
        ),
    }
    cache.write(cache_key, result)
    return result
