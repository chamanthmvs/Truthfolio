"""Evidence-based alternatives — *research leads*, never buy calls.

When a fund earns a Stop/Shift verdict, the honest next question a beginner asks is "so what
should I look at instead?". This module answers it the same way the rest of Truthfolio works:
by computing, not asserting.

How it stays honest:
- Candidates come from the *same* same-category peer sample used to rank the fund (peers.py),
  so we never compare across mandates (a large-cap vs a small-cap is not a fair swap).
- Every candidate is scored on a **self-health** basis — `verdict.synthesise` run with no peer
  ranks, so the peer-standing component drops out and the remaining four renormalise. This
  avoids recursion (we don't rank peers-of-peers) and ranks the subject and every candidate on
  one identical 4-metric yardstick, so "stronger" means stronger on the same ruler.
- A fund is only surfaced if it clears the subject on that composite AND beats it on a majority
  of the five concrete metrics we show. If nothing clears that bar, we say so plainly rather
  than manufacture a suggestion.
- The output is framed as leads to research, with the subject's own numbers shown beside each
  so the user checks the claim themselves. We never claim to know their goals, tax, or risk.
"""

from __future__ import annotations

import asyncio

from app.agent import verdict as verdict_engine
from app.analysis import peers as peers_mod
from app.analysis.metrics import compute_metrics
from app.data import amfi, cache, navapi

# A candidate must beat the subject by at least this much on the composite self-health score
# (0-100) before it is even considered — a sliver of an edge is noise, not a reason to switch.
_MIN_HEALTH_EDGE = 3.0
# ...and must win on a majority of the concrete metrics we display, so the composite edge is
# backed by metrics the user can see, not a lucky average.
_MIN_METRICS_WON = 3

_CACHE_TTL = 12 * 3600  # peer sample + metrics change slowly; recompute is free but not instant

# The concrete metrics we compare, with their human labels and "good" direction.
_COMPARE = [
    ("ret_5y", "5-year return", "%", "higher"),
    ("ret_3y", "3-year return", "%", "higher"),
    ("sharpe", "Sharpe (return per unit of risk)", "ratio", "higher"),
    ("sortino", "Sortino (return per unit of bad risk)", "ratio", "higher"),
    ("max_drawdown", "Worst drop", "%", "higher"),  # less negative is better
]


def _mval(metrics: dict, key: str) -> float | None:
    for m in metrics.get("metrics", []):
        if m.get("key") == key:
            return m.get("value")
    return None


def _consistency(metrics: dict) -> float | None:
    """Share of rolling windows that ended negative (prefer the 5y window). Lower is better."""
    rolling = metrics.get("rolling", [])
    if not rolling:
        return None
    r = next((x for x in rolling if x.get("window_years") == 5), rolling[0])
    return r.get("pct_negative")


def _self_health(metrics: dict) -> float | None:
    """Composite 0-100 health on a peer-standing-free basis (so candidates are comparable)."""
    try:
        result = verdict_engine.synthesise(metrics, {"ranks": []})
    except Exception:
        return None
    score = result.get("health_score")
    # synthesise returns 0.0 when it has nothing to go on; treat that as "no score".
    return score if score else None


async def _candidate(code: str, master: amfi.SchemeMaster) -> dict | None:
    scheme = master.get(code)
    if scheme is None:
        return None
    try:
        nav = await navapi.get_nav_series(code)
        metrics = compute_metrics(nav).as_dict()
    except Exception:
        return None  # a peer that fails to load simply drops out, exactly as in peers.py
    health = _self_health(metrics)
    if health is None:
        return None
    return {
        "code": code,
        "name": scheme.base_name or scheme.name,
        "full_name": scheme.name,
        "amc": scheme.amc,
        "category": scheme.category,
        "metrics": metrics,
        "health": health,
    }


def _fmt(value: float | None, unit: str) -> str:
    if value is None:
        return "n/a"
    if unit == "%":
        return f"{value * 100:.1f}%"
    return f"{value:.2f}"


def _compare(subject: dict, alt: dict) -> tuple[list[dict], list[str], int]:
    """Build the per-metric comparison, plain-language reasons, and the count the alt wins."""
    rows: list[dict] = []
    reasons: list[str] = []
    won = 0

    checks = list(_COMPARE) + [("consistency", "Consistency (how often it dipped)", "%", "lower")]
    for key, label, unit, direction in checks:
        if key == "consistency":
            a, s = _consistency(alt["metrics"]), _consistency(subject["metrics"])
        else:
            a, s = _mval(alt["metrics"], key), _mval(subject["metrics"], key)
        if a is None or s is None:
            continue
        better = a > s if direction == "higher" else a < s
        rows.append({
            "key": key,
            "label": label,
            "unit": unit,
            "alt_value": a,
            "subject_value": s,
            "better": better,
        })
        if better:
            won += 1
            reasons.append(_reason(key, label, a, s, unit))
    return rows, reasons, won


def _headline(won: int, total: int, edge: float | None, category: str) -> str:
    """One scannable, factual line summarising why this alternative is stronger."""
    # `category` already reads like "Flexi Cap Fund" / "ELSS", so don't append "fund".
    lead = f"Another {category} that beats yours on {won} of {total} core measures"
    if edge:
        return f"{lead}, scoring {edge:.0f} points higher on the same health yardstick."
    return f"{lead} — a like-for-like comparison, so it's a fair swap to research."


def _reason(key: str, label: str, a: float, s: float, unit: str) -> str:
    av, sv = _fmt(a, unit), _fmt(s, unit)
    if key in ("ret_5y", "ret_3y"):
        horizon = "5-year" if key == "ret_5y" else "3-year"
        return f"Grew faster over {horizon}: {av} a year vs {sv}."
    if key == "sharpe":
        return f"More return for the ups-and-downs it put you through (Sharpe {av} vs {sv})."
    if key == "sortino":
        return f"More return for the *painful* falls specifically (Sortino {av} vs {sv})."
    if key == "max_drawdown":
        return f"Its worst-ever fall was gentler: {av} vs {sv}."
    if key == "consistency":
        return f"Dipped less often across its history ({av} of windows negative vs {sv})."
    return f"Better {label}: {av} vs {sv}."


async def recommend_alternatives(subject_code: str, limit: int = 3) -> dict:
    master = await amfi.get_master()
    subject_scheme = master.get(subject_code)
    if subject_scheme is None:
        return _empty(None, "We couldn't find this fund to compare.")

    cache_key = f"reco_v2_{subject_code}"  # v2: added per-alternative headline
    cached = cache.read(cache_key, _CACHE_TTL)
    if cached is not None:
        return cached

    try:
        subject_nav = await navapi.get_nav_series(subject_code)
        subject_metrics = compute_metrics(subject_nav).as_dict()
    except Exception:
        return _empty(subject_scheme, "We couldn't load this fund's data to compare.")

    subject_health = _self_health(subject_metrics)
    subject = {
        "code": subject_code,
        "name": subject_scheme.base_name or subject_scheme.name,
        "category": subject_scheme.category,
        "metrics": subject_metrics,
        "health": subject_health,
    }

    codes = peers_mod.pick_peer_codes(master, subject_scheme)
    gathered = await asyncio.gather(*(_candidate(c, master) for c in codes))
    candidates = [c for c in gathered if c is not None]

    scored: list[dict] = []
    for c in candidates:
        if subject_health is not None and c["health"] - subject_health < _MIN_HEALTH_EDGE:
            continue
        rows, reasons, won = _compare(subject, c)
        if won < _MIN_METRICS_WON:
            continue
        edge = None if subject_health is None else round(c["health"] - subject_health, 1)
        scored.append({
            "scheme_code": c["code"],
            "scheme_name": c["name"],
            "amc": c["amc"],
            "category": c["category"],
            "strength_score": round(c["health"], 1),
            "strength_edge": edge,
            "metrics_won": won,
            "headline": _headline(won, len(rows), edge, c["category"]),
            "reasons": reasons[:4],
            "comparison": rows,
        })

    scored.sort(key=lambda x: x["strength_score"], reverse=True)
    alternatives = scored[:limit]

    result = {
        "subject": {
            "scheme_code": subject_code,
            "scheme_name": subject["name"],
            "category": subject["category"],
            "strength_score": None if subject_health is None else round(subject_health, 1),
        },
        "peers_considered": len(candidates),
        "alternatives": alternatives,
        "basis": (
            "Each fund below is scored on the same four core metrics we used above — long-term "
            "return, risk-adjusted return, consistency and worst drop — with peer standing set "
            "aside so the comparison is a fair, like-for-like ruler. We only list a fund if it "
            "beats this one on that score and on most of the individual metrics."
        ),
        "disclaimer": (
            "These are leads to research, not a recommendation to buy. We don't know your goals, "
            "time horizon, tax situation or how much risk you can take — all of which matter. "
            "Check each fund's full review, and consider talking to a SEBI-registered investment "
            "adviser before moving money."
        ),
        "empty_reason": (
            None if alternatives else
            "No same-category fund in our sample scores clearly higher on these transparent "
            "metrics. Staying put may be as reasonable as switching — the gap simply isn't there."
        ),
    }
    cache.write(cache_key, result)
    return result


def _empty(subject_scheme: amfi.Scheme | None, reason: str) -> dict:
    return {
        "subject": (
            None if subject_scheme is None else {
                "scheme_code": subject_scheme.code,
                "scheme_name": subject_scheme.base_name or subject_scheme.name,
                "category": subject_scheme.category,
                "strength_score": None,
            }
        ),
        "peers_considered": 0,
        "alternatives": [],
        "basis": "",
        "disclaimer": "",
        "empty_reason": reason,
    }
