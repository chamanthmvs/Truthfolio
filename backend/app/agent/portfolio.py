"""Portfolio orchestrator.

Runs a fund-level review for every holding (concurrently, bounded by the NAV-fetch
semaphore), attaches each holding's personal cost-basis numbers, then aggregates into a
portfolio-level summary. Designed to be driven either in one shot (`analyze_portfolio`) or
incrementally for streaming UIs (`analyze_holding` per fund + `aggregate`).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.agent.graph import review_fund
from app.analysis import portfolio as agg
from app.analysis.review_view import assemble_review
from app.data import amfi


@dataclass(slots=True)
class HoldingInput:
    scheme_code: str
    units: float
    avg_nav: float


async def analyze_holding(holding: HoldingInput) -> dict | None:
    """Full review + personal numbers for one holding. Returns None if the fund can't load."""
    master = await amfi.get_master()
    scheme = master.get(holding.scheme_code)
    if scheme is None:
        return None
    invested = holding.units * holding.avg_nav
    try:
        state = await review_fund(
            scheme_code=scheme.code, scheme_name=scheme.name,
            category=scheme.category, base_name=scheme.base_name, amc=scheme.amc,
            units=holding.units, invested_amount=invested,
        )
    except Exception:
        return None

    review = assemble_review(
        scheme_code=scheme.code, scheme_name=scheme.name,
        category=scheme.category, state=state,
    )
    current_nav = state.get("metrics", {}).get("latest_nav")
    if not current_nav:
        return None
    personal = agg.compute_personal(holding.units, holding.avg_nav, float(current_nav))
    return {"review": review, "personal": personal.as_dict()}


def _attach_weights(holdings: list[dict]) -> None:
    total = sum(h["personal"]["current_value"] for h in holdings)
    for h in holdings:
        h["weight"] = (h["personal"]["current_value"] / total) if total > 0 else 0.0


async def analyze_portfolio(holdings: list[HoldingInput]) -> dict:
    results = await asyncio.gather(*(analyze_holding(h) for h in holdings))
    valid = [r for r in results if r is not None]
    if not valid:
        return {"summary": None, "holdings": [], "errors": len(holdings)}
    _attach_weights(valid)
    summary = agg.aggregate(valid)
    return {
        "summary": summary.as_dict(),
        "holdings": valid,
        "errors": len(holdings) - len(valid),
    }
