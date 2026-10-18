"""Public entry points for the agent layer.

The orchestration now lives in the supervisor (see supervisor.py). This module keeps the
stable, high-level functions the API calls — `review_fund`, `research_fund`, and
`build_graph` (the compiled supervisor, used by the SSE stream) — so the rest of the app is
decoupled from the graph's internals.
"""

from __future__ import annotations

from app.agent.state import AgentState
from app.agent.supervisor import build_supervisor, run_task

# The compiled supervisor graph (SSE streaming uses this directly via .astream).
build_graph = build_supervisor


async def review_fund(
    scheme_code: str, scheme_name: str, category: str = "",
    base_name: str = "", amc: str = "",
    units: float | None = None, invested_amount: float | None = None,
    deep: bool = False,
) -> AgentState:
    """Standard fund review (deterministic, free). `deep=True` also runs web research."""
    return await run_task(
        "fund_review_deep" if deep else "fund_review",
        scheme_code=scheme_code,
        scheme_name=scheme_name,
        base_name=base_name or scheme_name,
        amc=amc,
        category=category,
        units=units,
        invested_amount=invested_amount,
    )


async def research_fund(
    scheme_code: str, scheme_name: str, base_name: str = "", amc: str = "", category: str = "",
) -> AgentState:
    """Run ONLY the web-research specialist for one fund (the on-demand, credit-spending path)."""
    return await run_task(
        "research_only",
        scheme_code=scheme_code,
        scheme_name=scheme_name,
        base_name=base_name or scheme_name,
        amc=amc,
        category=category,
    )
