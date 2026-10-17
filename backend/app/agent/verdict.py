"""Transparent, rule-based verdict synthesis.

This is deliberately deterministic and fully inspectable: given the evidence ledger it
produces a 0..100 health score from documented, weighted components, then maps that score
(plus peer context) to Continue / Stop / Shift with an explicit confidence.

Why rule-based at the core? Trust. A user can audit exactly why the fund scored what it
did. The optional LLM layer writes the *narrative* around this and can add qualitative
web-sourced evidence, but it does not override the arithmetic of the score — it explains it.

The three verdicts:
  Continue  — fund is healthy and competitive within its peer group.
  Shift     — fund is mediocre AND clearly beaten by accessible same-category peers.
  Stop      — fund is weak on an absolute, risk-adjusted basis (not just relative).
"""

from __future__ import annotations

from app.agent.appraisal import computed_source
from app.agent.state import EvidenceItem

# Component weights for the health score — visible and tunable. They sum to 1.0.
WEIGHTS = {
    "long_term_return": 0.22,  # 3y/5y CAGR, absolute quality
    "risk_adjusted": 0.26,  # Sharpe/Sortino — return per unit of risk
    "peer_standing": 0.30,  # percentile vs same-category peers (the honesty anchor)
    "consistency": 0.14,  # rolling-return behaviour, % negative windows
    "drawdown": 0.08,  # how brutal the worst fall was
}


def _score_long_term_return(metrics: dict) -> tuple[float, str] | None:
    val = _mval(metrics, "ret_5y") or _mval(metrics, "ret_3y")
    if val is None:
        return None
    # Map CAGR 0%..20% onto 0..100, clamped.
    s = max(0.0, min(100.0, (val / 0.20) * 100.0))
    return s, f"Long-term return {val:.1%} annualised"


def _score_risk_adjusted(metrics: dict) -> tuple[float, str] | None:
    sharpe = _mval(metrics, "sharpe")
    sortino = _mval(metrics, "sortino")
    if sharpe is None and sortino is None:
        return None
    parts = [v for v in (sharpe, sortino) if v is not None]
    avg = sum(parts) / len(parts)
    # Sharpe/Sortino ~1.5 is strong -> 100; 0 -> 0.
    s = max(0.0, min(100.0, (avg / 1.5) * 100.0))
    return s, f"Risk-adjusted (Sharpe {sharpe}, Sortino {sortino})"


def _score_peer_standing(peers: dict) -> tuple[float, str] | None:
    ranks = {r["key"]: r for r in peers.get("ranks", [])}
    pcts = [
        ranks[k]["percentile"]
        for k in ("ret_3y", "ret_5y", "sharpe")
        if ranks.get(k) and ranks[k].get("percentile") is not None
    ]
    if not pcts:
        return None
    avg_pct = sum(pcts) / len(pcts)
    return avg_pct * 100.0, f"Peer percentile {avg_pct:.0%} across return & risk-adjusted"


def _score_consistency(metrics: dict) -> tuple[float, str] | None:
    rolling = metrics.get("rolling", [])
    if not rolling:
        return None
    # Prefer the 5y window; fall back to 3y.
    r = next((x for x in rolling if x["window_years"] == 5), rolling[0])
    pct_neg = r["pct_negative"]
    s = max(0.0, 100.0 * (1.0 - pct_neg * 4))  # 25% negative windows -> 0
    return s, f"{r['window_years']}y rolling returns negative {pct_neg:.0%} of the time"


def _score_drawdown(metrics: dict) -> tuple[float, str] | None:
    dd = _mval(metrics, "max_drawdown")
    if dd is None:
        return None
    # -20% -> 100, -60% -> 0
    s = max(0.0, min(100.0, (1.0 - (abs(dd) - 0.20) / 0.40) * 100.0))
    return s, f"Worst drawdown {dd:.0%}"


def _mval(metrics: dict, key: str) -> float | None:
    for m in metrics.get("metrics", []):
        if m["key"] == key:
            return m["value"]
    return None


def build_evidence(metrics: dict, peers: dict) -> list[EvidenceItem]:
    """Turn computed metrics + peer ranks into primary (computed) evidence items."""
    evidence: list[EvidenceItem] = []

    def add(claim, category, direction, weight, confidence, detail):
        evidence.append(
            EvidenceItem(
                claim=claim, category=category, direction=direction,
                weight=weight, confidence=confidence, sources=[computed_source(detail)],
            )
        )

    # Peer standing (the anchor)
    peer = _score_peer_standing(peers)
    if peer:
        pct = peer[0] / 100.0
        direction = "positive" if pct >= 0.6 else "negative" if pct < 0.4 else "neutral"
        add(
            f"Ranks in the {_ordinal(pct)} percentile of its {peers.get('category','')} peers "
            f"on return and risk-adjusted metrics ({peers.get('peers_analysed',0)} peers analysed).",
            "peer", direction, WEIGHTS["peer_standing"], 0.9, peer[1],
        )

    lt = _score_long_term_return(metrics)
    if lt:
        direction = "positive" if lt[0] >= 60 else "negative" if lt[0] < 40 else "neutral"
        add(lt[1] + ".", "performance", direction, WEIGHTS["long_term_return"], 0.95, lt[1])

    ra = _score_risk_adjusted(metrics)
    if ra:
        direction = "positive" if ra[0] >= 60 else "negative" if ra[0] < 40 else "neutral"
        add(
            "Delivers " + ("strong" if direction == "positive" else
                           "weak" if direction == "negative" else "fair")
            + " returns for the risk taken.", "risk", direction,
            WEIGHTS["risk_adjusted"], 0.9, ra[1],
        )

    cons = _score_consistency(metrics)
    if cons:
        direction = "positive" if cons[0] >= 60 else "negative" if cons[0] < 40 else "neutral"
        add(cons[1].capitalize() + ".", "consistency", direction,
            WEIGHTS["consistency"], 0.85, cons[1])

    dd = _score_drawdown(metrics)
    if dd:
        direction = "positive" if dd[0] >= 60 else "negative" if dd[0] < 40 else "neutral"
        add(dd[1] + " — " + ("manageable" if direction == "positive" else "painful") + ".",
            "risk", direction, WEIGHTS["drawdown"], 0.95, dd[1])

    return evidence


def synthesise(metrics: dict, peers: dict) -> dict:
    """Compute health score + verdict + confidence from the component scorers."""
    components: dict[str, float] = {}
    present_weight = 0.0
    weighted_sum = 0.0

    scorers = {
        "long_term_return": _score_long_term_return(metrics),
        "risk_adjusted": _score_risk_adjusted(metrics),
        "peer_standing": _score_peer_standing(peers),
        "consistency": _score_consistency(metrics),
        "drawdown": _score_drawdown(metrics),
    }
    for name, result in scorers.items():
        if result is None:
            continue
        components[name] = round(result[0], 1)
        weighted_sum += result[0] * WEIGHTS[name]
        present_weight += WEIGHTS[name]

    health = (weighted_sum / present_weight) if present_weight else 0.0

    # Peer percentile drives the Continue/Shift/Stop distinction.
    peer_result = scorers["peer_standing"]
    peer_pct = (peer_result[0] / 100.0) if peer_result else None

    if health >= 62 and (peer_pct is None or peer_pct >= 0.45):
        verdict = "Continue"
    elif health < 42:
        verdict = "Stop"
    elif peer_pct is not None and peer_pct < 0.45:
        verdict = "Shift"
    else:
        verdict = "Continue" if health >= 55 else "Shift"

    # Confidence: data completeness × evidence agreement.
    completeness = present_weight  # already 0..1 (weights sum to 1)
    agreement = _agreement(scorers)
    confidence = round(max(0.25, min(0.95, 0.5 * completeness + 0.5 * agreement)), 2)

    return {
        "health_score": round(health, 1),
        "verdict": verdict,
        "confidence": confidence,
        "components": components,
        "weights": WEIGHTS,
        "peer_percentile": None if peer_pct is None else round(peer_pct, 3),
    }


def _agreement(scorers: dict) -> float:
    """1.0 when all present components point the same way, lower when they conflict."""
    vals = [r[0] for r in scorers.values() if r is not None]
    if len(vals) < 2:
        return 0.5
    above = sum(1 for v in vals if v >= 55)
    below = sum(1 for v in vals if v < 45)
    dominant = max(above, below)
    return dominant / len(vals)


def _ordinal(pct: float) -> str:
    n = int(round(pct * 100))
    return f"{n}th"
