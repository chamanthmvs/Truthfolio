"""Research agent — the qualitative, web-sourced half of an honest verdict.

Pipeline (only active when BOTH an LLM key and a Tavily key are configured):
  1. Search the web for the decision-relevant facts numbers can't capture — manager changes,
     expense ratio, mandate/style drift, AUM bloat, regulatory actions / controversies.
  2. Appraise every source through the reliability gate (appraisal.py).
  3. Register each trusted source in the citation registry (→ numbered footnotes).
  4. Ask the LLM to extract concise, factual claims, each tagged with inline [n] markers
     pointing to the sources that support it — and nothing it can't cite.

Returns an evidence list (EvidenceItem) + footnotes. Degrades to empty when keys are absent,
so the deterministic review is unaffected.
"""

from __future__ import annotations

import asyncio
import json

from app.agent.appraisal import TRUST_FLOOR, appraise_web_source
from app.agent.citations import CitationRegistry
from app.agent.state import EvidenceItem, SourceRef
from app.config import get_settings
from app.data import websearch

# Kept deliberately to TWO broad queries per fund to conserve Tavily credits (one for the
# core facts, one for recent news/regulatory). Each is a single "basic"-depth search.
# (topic key, query template, tavily topic, recency days)
_TOPICS: list[tuple[str, str, str, int | None]] = [
    ("facts", '"{name}" {amc} fund manager expense ratio AUM investment strategy mandate', "general", None),
    ("news", '{amc} "{name}" SEBI action news risk controversy', "news", 540),
]

_SYSTEM = """You are a meticulous, skeptical mutual-fund research analyst. From the SOURCES \
provided, extract only concrete, decision-relevant FACTS about this specific fund — things a \
returns chart can't show: manager identity/changes, expense ratio, mandate or style drift, \
fund size/AUM concerns, regulatory actions or controversies.

Hard rules:
- Use ONLY the provided sources. Never add outside knowledge, never guess, never infer beyond \
what a source states.
- EVERY claim must cite its supporting source(s) with inline markers like [1] or [1,3] using \
the source numbers given. A claim you can't cite does not belong.
- Prefer claims backed by higher-reliability and more recent sources; ignore weak/irrelevant \
sources.
- Classify each claim: direction = "positive" | "negative" | "neutral" (for the investor), \
category = "manager" | "cost" | "mandate" | "size" | "regulatory" | "other", and \
severity = "low" | "medium" | "high".
- Keep each claim to one plain-English sentence a beginner understands. Be specific (names, \
numbers, dates) when the source gives them. Produce at most 8 of the most important claims. \
If the sources don't support any solid claim, return an empty list.

Return STRICT JSON: {"claims": [{"text": str (with inline [n] markers), "direction": str, \
"category": str, "severity": str, "citations": [int, ...]}]}."""


async def _gather(base_name: str, amc: str) -> dict[str, list[websearch.WebResult]]:
    settings = get_settings()

    async def one(tpl: str, topic: str, days: int | None) -> list[websearch.WebResult]:
        q = tpl.format(name=base_name, amc=amc)
        return await websearch.search_web(q, topic=topic, days=days, max_results=settings.search_max_results)

    tasks = {key: one(tpl, topic, days) for key, tpl, topic, days in _TOPICS}
    results = await asyncio.gather(*tasks.values())
    return dict(zip(tasks.keys(), results))


async def run_fund_research(*, scheme_name: str, base_name: str, amc: str, category: str) -> dict:
    """Return {"evidence": [EvidenceItem], "footnotes": [...], "used": bool}."""
    settings = get_settings()
    if not settings.research_enabled:
        return {"evidence": [], "footnotes": [], "used": False}

    by_topic = await _gather(base_name, amc)

    registry = CitationRegistry()
    sourceref_by_n: dict[int, SourceRef] = {}
    context_lines: list[str] = []

    for topic_key, results in by_topic.items():
        domains = {r.domain for r in results if r.domain}
        for r in results:
            if not r.url or not r.content:
                continue
            ref = appraise_web_source(
                title=r.title,
                url=r.url,
                published=r.published,
                corroborating_sources=max(0, len(domains) - 1),
            )
            if ref.get("reliability", 0) < TRUST_FLOOR:
                continue
            n = registry.add(
                title=r.title,
                url=r.url,
                reliability=ref["reliability"],
                published=r.published.isoformat() if r.published else None,
            )
            sourceref_by_n[n] = ref
            snippet = r.content[:500]
            context_lines.append(
                f"[{n}] ({topic_key}) {r.domain} · "
                f"{r.published.isoformat() if r.published else 'date unknown'} · "
                f"reliability {ref['reliability']:.2f}\n    {r.title}\n    {snippet}"
            )

    if not context_lines:
        return {"evidence": [], "footnotes": [], "used": True}

    claims = await _extract_claims(scheme_name, category, context_lines)

    evidence: list[EvidenceItem] = []
    for c in claims:
        cites = [n for n in c.get("citations", []) if n in sourceref_by_n]
        if not cites:
            continue  # uncited claim is not allowed to enter the ledger
        sources = [sourceref_by_n[n] for n in cites]
        reliab = min(s.get("reliability", 0.4) for s in sources)
        severity = c.get("severity", "low")
        weight = {"high": 0.14, "medium": 0.08, "low": 0.04}.get(severity, 0.04)
        evidence.append(
            EvidenceItem(
                claim=c.get("text", "").strip(),
                category=c.get("category", "other"),
                direction=c.get("direction", "neutral"),
                weight=weight,
                confidence=round(reliab, 2),
                sources=sources,
            )
        )

    return {"evidence": evidence, "footnotes": registry.footnotes(), "used": True}


async def _extract_claims(scheme_name: str, category: str, context_lines: list[str]) -> list[dict]:
    settings = get_settings()
    try:
        from langchain_anthropic import ChatAnthropic

        llm = ChatAnthropic(
            model=settings.llm_model,
            api_key=settings.anthropic_api_key,
            max_tokens=settings.llm_max_tokens,
            temperature=0.1,
        )
        user = (
            f"Fund: {scheme_name} (category: {category}).\n\n"
            f"SOURCES (cite by the number in brackets):\n\n" + "\n\n".join(context_lines)
        )
        resp = await llm.ainvoke([("system", _SYSTEM), ("human", user)])
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            return []
        data = json.loads(text[start : end + 1])
        return data.get("claims", []) if isinstance(data, dict) else []
    except Exception:
        return []  # research is additive; never break the review on its failure
