"""Assemble a fund-review view dict (metrics enriched with explainers) from agent state.

Shared by the single-fund endpoint and the portfolio orchestrator so a holding's embedded
review is byte-for-byte the same shape as a standalone review — the frontend reuses one
component for both.
"""

from __future__ import annotations

from typing import Any

from app.analysis import explainers


def enrich_metrics(metrics_block: dict) -> list[dict]:
    out: list[dict] = []
    for m in metrics_block.get("metrics", []):
        out.append({**m, **explainers.attach(m["key"], m["value"])})
    return out


def assemble_review(
    *, scheme_code: str, scheme_name: str, category: str, state: dict[str, Any]
) -> dict:
    metrics_block = state.get("metrics", {})
    return {
        "scheme_code": scheme_code,
        "scheme_name": scheme_name,
        "category": state.get("category") or category,
        "as_of": metrics_block.get("as_of"),
        "verdict": state.get("verdict", "Inconclusive"),
        "health_score": state.get("health_score", 0.0),
        "confidence": state.get("confidence", 0.0),
        "headline": state.get("headline", ""),
        "narrative": state.get("narrative", ""),
        "caveats": state.get("caveats", []),
        "metrics": enrich_metrics(metrics_block),
        "qualitative": state.get("qualitative", {}),
        "rolling": metrics_block.get("rolling", []),
        "peers": state.get("peers", {}),
        "evidence": state.get("evidence", []),
        "footnotes": state.get("footnotes", []),
        "steps": state.get("steps", []),
        "llm_used": state.get("llm_used", False),
        "research_used": state.get("research_used", False),
    }
