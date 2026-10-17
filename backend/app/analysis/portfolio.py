"""Portfolio-level aggregation — pure, transparent, auditable.

Given each holding's cost basis (units + average buy NAV), its current NAV, and its
fund-level review, this computes:
  - your *personal* numbers: invested, current value, gain/loss, return % (per fund + total)
  - weights, category mix, and concentration (HHI + top-category share)
  - a blended portfolio health score and an honest portfolio verdict
  - which funds drag the portfolio down and what to reconsider

Every number here is arithmetic on real inputs — nothing estimated. Personal return is an
*absolute* (total-so-far) figure, NOT annualised, because we don't collect purchase dates;
this is stated plainly as a caveat so no one misreads it.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class Personal:
    units: float
    avg_nav: float
    current_nav: float
    invested: float
    current_value: float
    gain: float
    return_pct: float  # absolute, total-so-far (not annualised)

    def as_dict(self) -> dict:
        return {
            "units": round(self.units, 4),
            "avg_nav": round(self.avg_nav, 4),
            "current_nav": round(self.current_nav, 4),
            "invested": round(self.invested, 2),
            "current_value": round(self.current_value, 2),
            "gain": round(self.gain, 2),
            "return_pct": round(self.return_pct, 4),
        }


def compute_personal(units: float, avg_nav: float, current_nav: float) -> Personal:
    invested = units * avg_nav
    current_value = units * current_nav
    gain = current_value - invested
    return_pct = (gain / invested) if invested > 0 else 0.0
    return Personal(
        units=units, avg_nav=avg_nav, current_nav=current_nav,
        invested=invested, current_value=current_value, gain=gain, return_pct=return_pct,
    )


@dataclass(slots=True)
class CategorySlice:
    category: str
    value: float
    pct: float

    def as_dict(self) -> dict:
        return {"category": self.category, "value": round(self.value, 2), "pct": round(self.pct, 4)}


@dataclass(slots=True)
class PortfolioSummary:
    total_invested: float
    total_current: float
    total_gain: float
    overall_return_pct: float
    health_score: float
    verdict: str  # "Healthy" | "Minor tweaks" | "Needs rebalancing"
    confidence: float
    category_mix: list[CategorySlice] = field(default_factory=list)
    hhi: float = 0.0
    top_holding_pct: float = 0.0
    top_category: str = ""
    top_category_pct: float = 0.0
    diversification: str = ""  # plain label
    best_performer: dict | None = None
    worst_performer: dict | None = None
    action_items: list[str] = field(default_factory=list)
    headline: str = ""
    caveats: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "total_invested": round(self.total_invested, 2),
            "total_current": round(self.total_current, 2),
            "total_gain": round(self.total_gain, 2),
            "overall_return_pct": round(self.overall_return_pct, 4),
            "health_score": round(self.health_score, 1),
            "verdict": self.verdict,
            "confidence": round(self.confidence, 2),
            "category_mix": [c.as_dict() for c in self.category_mix],
            "hhi": round(self.hhi, 4),
            "top_holding_pct": round(self.top_holding_pct, 4),
            "top_category": self.top_category,
            "top_category_pct": round(self.top_category_pct, 4),
            "diversification": self.diversification,
            "best_performer": self.best_performer,
            "worst_performer": self.worst_performer,
            "action_items": self.action_items,
            "headline": self.headline,
            "caveats": self.caveats,
        }


def _diversification_label(n_funds: int, hhi: float, top_cat_pct: float) -> tuple[str, float]:
    """Return (plain label, penalty_points 0..12) from concentration signals."""
    if n_funds <= 1:
        return ("Everything is in a single fund — no diversification at all.", 12.0)
    if top_cat_pct >= 0.7 or hhi >= 0.5:
        return (
            "Heavily concentrated — most of your money rides on one fund or one type of fund.",
            10.0,
        )
    if top_cat_pct >= 0.5 or hhi >= 0.33:
        return ("Somewhat concentrated — a large chunk sits in one area.", 5.0)
    if n_funds >= 4 and hhi < 0.25:
        return ("Nicely spread out across funds and categories.", 0.0)
    return ("Reasonably spread, with room to diversify a little more.", 2.0)


def aggregate(holdings: list[dict]) -> PortfolioSummary:
    """holdings: list of {review: <fund review dict>, personal: <Personal.as_dict>}.

    The review dict must carry 'scheme_name', 'category', 'verdict', 'health_score'.
    """
    total_invested = sum(h["personal"]["invested"] for h in holdings)
    total_current = sum(h["personal"]["current_value"] for h in holdings)
    total_gain = total_current - total_invested
    overall_return = (total_gain / total_invested) if total_invested > 0 else 0.0

    # Weights by current value (how your money is actually distributed today).
    weights: list[float] = [
        (h["personal"]["current_value"] / total_current) if total_current > 0 else 0.0
        for h in holdings
    ]

    # Category mix.
    cat_values: dict[str, float] = {}
    for h in holdings:
        cat = h["review"].get("category", "Unknown") or "Unknown"
        cat_values[cat] = cat_values.get(cat, 0.0) + h["personal"]["current_value"]
    category_mix = sorted(
        (
            CategorySlice(cat, val, (val / total_current) if total_current > 0 else 0.0)
            for cat, val in cat_values.items()
        ),
        key=lambda c: c.value,
        reverse=True,
    )

    hhi = sum(w * w for w in weights)
    top_holding_pct = max(weights) if weights else 0.0
    top_category = category_mix[0].category if category_mix else ""
    top_category_pct = category_mix[0].pct if category_mix else 0.0

    # Blended health: value-weighted average of each fund's health, minus a transparent
    # concentration penalty.
    weighted_health = sum(
        w * h["review"].get("health_score", 0.0) for w, h in zip(weights, holdings)
    )
    div_label, penalty = _diversification_label(len(holdings), hhi, top_category_pct)
    health = max(0.0, min(100.0, weighted_health - penalty))

    if health >= 65 and penalty <= 5:
        verdict = "Healthy"
    elif health >= 50:
        verdict = "Minor tweaks"
    else:
        verdict = "Needs rebalancing"

    # Best / worst by personal return.
    ranked = sorted(holdings, key=lambda h: h["personal"]["return_pct"], reverse=True)
    best = _performer_brief(ranked[0]) if ranked else None
    worst = _performer_brief(ranked[-1]) if len(ranked) > 1 else None

    # Action items: funds flagged Shift/Stop, surfaced with their weight.
    action_items: list[str] = []
    for w, h in sorted(zip(weights, holdings), key=lambda x: x[0], reverse=True):
        v = h["review"].get("verdict")
        name = h["review"].get("scheme_name", "a fund")
        if v == "Stop":
            action_items.append(
                f"Seriously reconsider {name} — it's weak, and it holds {w*100:.0f}% of your money."
            )
        elif v == "Shift":
            action_items.append(
                f"Think about shifting {name} ({w*100:.0f}% of your money) to a stronger same-type fund."
            )
    if penalty >= 10:
        action_items.append(
            "Spread your money across more fund types — too much is riding on one bet right now."
        )

    headline = _headline(verdict, overall_return, div_label)

    caveats = [
        "This is educational analysis, not personalised investment advice.",
        "Your return here is the total gain so far, not a yearly rate — we don't ask for your "
        "purchase dates, so we can't annualise it.",
        "Overlap is judged at the fund-category level for now; two funds in the same category "
        "may hold many of the same stocks.",
        "Based on past NAV data; past performance does not guarantee future results.",
    ]

    return PortfolioSummary(
        total_invested=total_invested,
        total_current=total_current,
        total_gain=total_gain,
        overall_return_pct=overall_return,
        health_score=health,
        verdict=verdict,
        confidence=0.8 if len(holdings) >= 2 else 0.6,
        category_mix=category_mix,
        hhi=hhi,
        top_holding_pct=top_holding_pct,
        top_category=top_category,
        top_category_pct=top_category_pct,
        diversification=div_label,
        best_performer=best,
        worst_performer=worst,
        action_items=action_items,
        headline=headline,
        caveats=caveats,
    )


def _performer_brief(h: dict) -> dict:
    return {
        "scheme_name": h["review"].get("scheme_name", ""),
        "scheme_code": h["review"].get("scheme_code", ""),
        "return_pct": round(h["personal"]["return_pct"], 4),
        "gain": round(h["personal"]["gain"], 2),
    }


def _headline(verdict: str, overall_return: float, div_label: str) -> str:
    direction = "up" if overall_return >= 0 else "down"
    pct = f"{abs(overall_return) * 100:.1f}%"
    base = {
        "Healthy": f"Your portfolio is in good shape — {direction} {pct} overall.",
        "Minor tweaks": f"A solid portfolio, {direction} {pct} overall, with a few things worth tidying.",
        "Needs rebalancing": f"Your portfolio needs attention — {direction} {pct} overall, and the mix has real weak spots.",
    }[verdict]
    return base
