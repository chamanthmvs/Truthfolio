"""LangGraph state and the evidence model.

The evidence ledger is the spine of the product's honesty guarantee: nothing reaches a
verdict unless it is an EvidenceItem carrying its own sources and a reliability score.
Deterministic (computed) evidence is primary and scores highest; web-sourced claims must
pass the appraisal gate before they are allowed any weight.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

Verdict = Literal["Continue", "Stop", "Shift", "Inconclusive"]
Direction = Literal["positive", "negative", "neutral"]


class SourceRef(TypedDict, total=False):
    kind: str  # "computed" | "web" | "regulatory" | "amc"
    title: str
    url: str | None
    reliability: float  # 0..1 from the appraisal gate
    reliability_reasons: list[str]


class EvidenceItem(TypedDict, total=False):
    claim: str  # plain-language statement of fact
    category: str  # "performance" | "risk" | "consistency" | "cost" | "change" | "peer"
    direction: Direction  # does this support keeping the fund, or raise a concern?
    weight: float  # 0..1 importance in the final synthesis
    confidence: float  # 0..1 how sure we are of the claim itself
    sources: list[SourceRef]


class AgentState(TypedDict, total=False):
    # --- inputs ---
    scheme_code: str
    scheme_name: str
    base_name: str
    amc: str
    category: str
    units: float | None
    invested_amount: float | None

    # --- gathered artifacts (as plain dicts for serialisability) ---
    metrics: dict[str, Any]
    qualitative: dict[str, Any]
    peers: dict[str, Any]
    evidence: list[EvidenceItem]
    research_evidence: list[EvidenceItem]
    footnotes: list[dict[str, Any]]  # numbered citations for web-sourced claims
    research_used: bool
    insights: list[dict[str, Any]]  # structured insight cards
    insights_llm_used: bool

    # --- outputs ---
    health_score: float  # 0..100 transparent composite
    verdict: Verdict
    confidence: float  # 0..1
    headline: str
    narrative: str  # the honest written assessment
    caveats: list[str]

    # --- supervisor/orchestrator control ---
    task: str  # which plan the supervisor runs: "fund_review" | "fund_review_deep" | "research_only"
    plan: list[str] | None  # remaining specialist steps (supervisor-managed)
    _next: str | None  # next specialist to route to (supervisor-managed)

    # --- bookkeeping ---
    steps: list[str]  # progress trail for streaming to the UI
    llm_used: bool
