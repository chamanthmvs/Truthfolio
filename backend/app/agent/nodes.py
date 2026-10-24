"""LangGraph nodes.

Flow: quant → peers → evidence → synthesis → narrative.
Deterministic nodes always run and fully stand on their own (free, no credentials). The
narrative node uses Claude when a key is configured to write the honest assessment; without
one it falls back to a transparent template built from the same evidence — so the product
is useful and truthful even with zero LLM access.
"""

from __future__ import annotations

from app import disclaimer
from app.agent import verdict as verdict_engine
from app.agent.state import AgentState
from app.analysis import peers as peers_mod
from app.analysis.metrics import Metric, compute_metrics
from app.config import get_settings
from app.data import navapi


async def gather_quant(state: AgentState) -> AgentState:
    from app.analysis import qualitative

    nav = await navapi.get_nav_series(state["scheme_code"])
    report = compute_metrics(nav)
    steps = state.get("steps", []) + [
        f"Computed {len(report.metrics)} metrics from {len(nav.points)} NAV points "
        f"({report.history_years:.1f}y history)."
    ]
    return {
        "metrics": report.as_dict(),
        "qualitative": qualitative.build_qualitative(nav, report),
        "category": state.get("category") or "",
        "steps": steps,
    }


async def gather_peers(state: AgentState) -> AgentState:
    metrics = state["metrics"]
    subject_metrics = [
        Metric(m["key"], m["label"], m["value"], m["unit"], m["good_direction"])
        for m in metrics["metrics"]
    ]
    report = await peers_mod.compute_peer_report(state["scheme_code"], subject_metrics)
    steps = state.get("steps", []) + [
        f"Compared against {report.peers_analysed} same-category peers "
        f"('{report.category}', universe ~{report.peer_universe_size})."
    ]
    return {"peers": report.as_dict(), "category": report.category, "steps": steps}


async def gather_research(state: AgentState) -> AgentState:
    """Web-research the qualitative facts (manager, cost, mandate, size, regulatory).

    No-op without keys: returns empty, leaving the deterministic review untouched.
    """
    from app.agent import research

    result = await research.run_fund_research(
        scheme_name=state.get("scheme_name", ""),
        base_name=state.get("base_name") or state.get("scheme_name", ""),
        amc=state.get("amc", ""),
        category=state.get("category", ""),
    )
    steps = state.get("steps", [])
    if result["used"]:
        steps = steps + [
            f"Web research: {len(result['evidence'])} cited claim(s) from "
            f"{len(result['footnotes'])} appraised source(s)."
        ]
    return {
        "research_evidence": result["evidence"],
        "footnotes": result["footnotes"],
        "research_used": result["used"],
        "steps": steps,
    }


async def generate_insights(state: AgentState) -> AgentState:
    """Synthesise structured insight cards from the gathered evidence (LLM, cached)."""
    from app.agent import insights as insights_mod

    result = await insights_mod.generate_fund_insights(dict(state))
    steps = state.get("steps", []) + [
        f"Generated {len(result['insights'])} insight card(s)"
        f"{' with ' + ('AI' if result['llm_used'] else 'a deterministic fallback')}."
    ]
    return {"insights": result["insights"], "insights_llm_used": result["llm_used"], "steps": steps}


async def build_evidence(state: AgentState) -> AgentState:
    computed = verdict_engine.build_evidence(state["metrics"], state["peers"])
    researched = state.get("research_evidence", []) or []
    evidence = computed + researched
    extra = f" + {len(researched)} web-sourced" if researched else ""
    steps = state.get("steps", []) + [
        f"Assembled evidence ledger: {len(computed)} primary (computed){extra} item(s)."
    ]
    return {"evidence": evidence, "steps": steps}


async def synthesise(state: AgentState) -> AgentState:
    result = verdict_engine.synthesise(state["metrics"], state["peers"])
    steps = state.get("steps", []) + [
        f"Health score {result['health_score']}/100 → verdict: {result['verdict']} "
        f"(confidence {result['confidence']:.0%})."
    ]
    return {
        "health_score": result["health_score"],
        "verdict": result["verdict"],
        "confidence": result["confidence"],
        "steps": steps,
    }


def _deterministic_narrative(state: AgentState) -> dict:
    """Honest template narrative when no LLM is available."""
    verdict = state["verdict"]
    name = state.get("scheme_name", "This fund")
    peers = state.get("peers", {})
    pct = None
    for r in peers.get("ranks", []):
        if r["key"] == "ret_3y" and r["percentile"] is not None:
            pct = r["percentile"]
            break

    pos = [e for e in state.get("evidence", []) if e["direction"] == "positive"]
    neg = [e for e in state.get("evidence", []) if e["direction"] == "negative"]

    headline = {
        "Continue": f"Keep holding {name} — it stands up to scrutiny.",
        "Shift": f"Consider shifting out of {name} — better same-category options exist.",
        "Stop": f"Re-examine {name} — it is weak on an absolute, risk-adjusted basis.",
        "Inconclusive": f"Evidence on {name} is too thin for a confident call.",
    }[verdict]

    lines = [f"**{headline}**", ""]
    lines.append(
        f"This assessment is built from {len(state.get('evidence', []))} pieces of evidence, "
        f"every one computed directly from official NAV data (not estimated)."
    )
    if pct is not None:
        lines.append(
            f"Against its peer group it sits around the {int(pct*100)}th percentile on 3-year returns."
        )
    if pos:
        lines.append("")
        lines.append("**What's working**")
        lines += [f"- {e['claim']}" for e in pos]
    if neg:
        lines.append("")
        lines.append("**What's concerning**")
        lines += [f"- {e['claim']}" for e in neg]

    return {
        "headline": headline,
        "narrative": "\n".join(lines),
        "caveats": disclaimer.fund_caveats(),
        "llm_used": False,
    }


async def narrate(state: AgentState) -> AgentState:
    settings = get_settings()
    steps = state.get("steps", [])
    if not settings.llm_enabled:
        out = _deterministic_narrative(state)
        return {**out, "steps": steps + ["Narrative generated (deterministic template; "
                                         "no LLM key configured)."]}
    # LLM-authored narrative, grounded strictly in the computed evidence ledger.
    try:
        from app.agent.llm import write_narrative  # local import keeps LLM deps optional

        out = await write_narrative(state)
        # The disclaimer is never left to the model: always lead with the fixed caveats,
        # keeping any novel ones the LLM added.
        out["caveats"] = disclaimer.fund_caveats(out.get("caveats"))
        return {**out, "steps": steps + ["Narrative generated by the LLM, grounded in the "
                                         "evidence ledger."]}
    except Exception as exc:  # never let the LLM break the deterministic product
        out = _deterministic_narrative(state)
        return {**out, "steps": steps + [f"LLM narrative failed ({exc}); used deterministic "
                                         "fallback."]}
