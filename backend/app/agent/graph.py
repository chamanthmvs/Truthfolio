"""LangGraph assembly for the single-fund honest review.

The graph is intentionally linear for V1 (quant → peers → evidence → synthesis → narrative)
because each stage depends on the previous one's output. The web-research + source-appraisal
fan-out (already scaffolded in appraisal.py) plugs in between `peers` and `build_evidence`
in a later version without reshaping the rest.
"""

from __future__ import annotations

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from app.agent import nodes
from app.agent.state import AgentState


@lru_cache
def build_graph():
    g = StateGraph(AgentState)
    g.add_node("gather_quant", nodes.gather_quant)
    g.add_node("gather_peers", nodes.gather_peers)
    g.add_node("gather_research", nodes.gather_research)
    g.add_node("build_evidence", nodes.build_evidence)
    g.add_node("synthesise", nodes.synthesise)
    g.add_node("narrate", nodes.narrate)

    g.add_edge(START, "gather_quant")
    g.add_edge("gather_quant", "gather_peers")
    g.add_edge("gather_peers", "gather_research")
    g.add_edge("gather_research", "build_evidence")
    g.add_edge("build_evidence", "synthesise")
    g.add_edge("synthesise", "narrate")
    g.add_edge("narrate", END)
    return g.compile()


async def review_fund(
    scheme_code: str, scheme_name: str, category: str = "",
    base_name: str = "", amc: str = "",
    units: float | None = None, invested_amount: float | None = None,
) -> AgentState:
    graph = build_graph()
    initial: AgentState = {
        "scheme_code": scheme_code,
        "scheme_name": scheme_name,
        "base_name": base_name or scheme_name,
        "amc": amc,
        "category": category,
        "units": units,
        "invested_amount": invested_amount,
        "steps": [],
    }
    return await graph.ainvoke(initial)
