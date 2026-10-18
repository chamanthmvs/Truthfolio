"""Supervisor / orchestrator — the coordinator of the specialist agents.

Rather than one monolithic agent doing everything, Truthfolio uses the **supervisor pattern**:
a central supervisor owns a *plan* (an ordered list of specialists) for the requested task,
dispatches to one specialist at a time, and each specialist returns control to the supervisor
until the plan is exhausted. This keeps every specialist focused, makes the flow auditable,
and lets new specialists (insights, market-pulse) slot in by adding a plan — no rewiring.

Specialists (LangGraph nodes, reusing the existing deterministic + LLM logic):
  gather_quant     → NAV metrics + rolling returns          (deterministic)
  gather_peers     → same-category peer percentile ranking   (deterministic)
  gather_research  → web search → appraisal → cited claims    (LLM + Tavily, on-demand)
  build_evidence   → merge computed + web evidence            (deterministic)
  synthesise       → transparent health score + verdict       (deterministic)
  narrate          → honest written assessment                (LLM, or template fallback)

Routing is deterministic (plan-driven), so the orchestration itself costs no tokens and is
fully reproducible — the LLM is used only inside the specialists that need it.
"""

from __future__ import annotations

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from app.agent import nodes
from app.agent.state import AgentState

# Each task maps to the ordered specialists the supervisor will run.
PLANS: dict[str, list[str]] = {
    "fund_review": ["gather_quant", "gather_peers", "build_evidence", "synthesise", "narrate"],
    "fund_review_deep": [
        "gather_quant", "gather_peers", "gather_research",
        "build_evidence", "synthesise", "narrate",
    ],
    "research_only": ["gather_research"],
}

_SPECIALISTS = {
    "gather_quant": nodes.gather_quant,
    "gather_peers": nodes.gather_peers,
    "gather_research": nodes.gather_research,
    "build_evidence": nodes.build_evidence,
    "synthesise": nodes.synthesise,
    "narrate": nodes.narrate,
}


async def _supervisor(state: AgentState) -> dict:
    """Pick the next specialist from the plan (initialising it on first entry)."""
    plan = state.get("plan")
    if plan is None:
        plan = list(PLANS.get(state.get("task") or "fund_review", PLANS["fund_review"]))
    nxt = plan[0] if plan else None
    return {"plan": plan[1:], "_next": nxt}


def _route(state: AgentState) -> str:
    return state.get("_next") or END


@lru_cache
def build_supervisor():
    g = StateGraph(AgentState)
    g.add_node("supervisor", _supervisor)
    for name, fn in _SPECIALISTS.items():
        g.add_node(name, fn)
        g.add_edge(name, "supervisor")  # every specialist reports back to the supervisor

    g.add_edge(START, "supervisor")
    g.add_conditional_edges(
        "supervisor",
        _route,
        {**{name: name for name in _SPECIALISTS}, END: END},
    )
    return g.compile()


async def run_task(task: str, **inputs) -> AgentState:
    """Entry point: run a named task through the supervisor and return the final state."""
    graph = build_supervisor()
    initial: AgentState = {"task": task, "plan": None, "steps": [], **inputs}
    return await graph.ainvoke(initial)
