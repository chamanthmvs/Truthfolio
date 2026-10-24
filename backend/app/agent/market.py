"""Market Pulse specialist — an honest read on the broader market.

Synthesises a short, cited "market pulse" from recent web sources: the overall mood, what's
moving markets (triggers), bright spots, risks to watch, and what analysts expect.

Honesty guardrails (non-negotiable — this is the speculative part of the product):
  • Sentiment / triggers / highlights / risks are tied to cited sources.
  • PROJECTIONS are always attributed to a named source ("X expects …") and framed as that
    source's opinion — never presented as Truthfolio's own forecast or as advice.
  • Nothing is invented; every item carries an inline [n] citation.

Credit-aware: 2 (optionally 3) basic Tavily searches, heavily cached, and it simply reports
"unavailable" when the LLM/search keys aren't configured (there's no honest offline version).
"""

from __future__ import annotations

import asyncio
import re

from app.agent.appraisal import TRUST_FLOOR, appraise_web_source
from app.agent.citations import CitationRegistry
from app.agent.state import SourceRef
from app.config import get_settings
from app.data import cache, websearch

_VALID_TONES = {"positive", "neutral", "caution", "negative"}
_VALID_KINDS = {"triggers", "highlights", "watchouts", "outlook"}
_CITE_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")

# (key, query, tavily topic, recency days)
_QUERIES: list[tuple[str, str, str, int]] = [
    ("markets", "Indian stock market Nifty 50 Sensex today latest news and outlook", "news", 14),
    ("macro", "Indian economy markets RBI policy inflation FII DII flows risks", "news", 21),
]

_SYSTEM = """You are an honest market commentator for Indian investors. From the SOURCES below, \
write a concise MARKET PULSE a beginner can understand.

Hard rules (the product's whole point):
- Use ONLY the provided sources. Never invent facts or numbers. Every item must carry an \
inline citation marker like [1] or [2,3] using the source numbers given.
- PROJECTIONS/FORECASTS must be ATTRIBUTED to a named source and framed as THAT source's view \
(e.g. "Brokerage X expects …[2]"). Never state a forecast as fact, as your own view, or as \
advice.
- CHILD-LEVEL CLARITY: short, plain sentences; explain any jargon in the same breath.
- Be balanced and honest: include both bright spots and real risks. Don't hype.

Return STRICT JSON only:
{"mood": {"label": str (2-4 words, e.g. "Cautiously optimistic"), "tone": \
"positive"|"neutral"|"caution"|"negative", "summary": str (one plain sentence)},
 "sections": [
   {"kind": "triggers"|"highlights"|"watchouts"|"outlook", "title": str,
    "items": [{"text": str (with inline [n]), "tone": "positive"|"neutral"|"caution"|"negative"}]}
 ]}
Include, in order, the sections: triggers (what's moving markets), highlights (bright spots), \
watchouts (risks), outlook (attributed analyst expectations). 2-4 items each; omit a section \
only if the sources truly offer nothing for it."""


async def generate_market_pulse(focus: str | None = None) -> dict:
    settings = get_settings()
    if not settings.research_enabled:
        return {
            "enabled": False,
            "reason": "Market Pulse needs both an LLM key and a Tavily key configured.",
            "pulse": None, "footnotes": [], "budget": websearch.budget_status(),
        }

    key = f"market_pulse_{(focus or 'overall').lower().replace(' ', '_')}"
    cached = cache.read(key, 6 * 3600)  # fresh enough for a daily pulse; spares credits
    if cached is not None:
        return cached

    queries = list(_QUERIES)
    if focus:
        queries.append(("focus", f"{focus} mutual funds India outlook and performance", "news", 30))

    async def one(q: str, topic: str, days: int):
        return await websearch.search_web(q, topic=topic, days=days, max_results=settings.search_max_results)

    results = await asyncio.gather(*(one(q, t, d) for _k, q, t, d in queries))

    registry = CitationRegistry()
    sourceref_by_n: dict[int, SourceRef] = {}
    context: list[str] = []
    for batch in results:
        domains = {r.domain for r in batch if r.domain}
        for r in batch:
            if not r.url or not r.content:
                continue
            ref = appraise_web_source(
                title=r.title, url=r.url, published=r.published,
                corroborating_sources=max(0, len(domains) - 1),
            )
            if ref.get("reliability", 0) < TRUST_FLOOR:
                continue
            n = registry.add(
                title=r.title, url=r.url, reliability=ref["reliability"],
                published=r.published.isoformat() if r.published else None,
            )
            sourceref_by_n[n] = ref
            context.append(
                f"[{n}] {r.domain} · {r.published.isoformat() if r.published else 'date unknown'}"
                f" · reliability {ref['reliability']:.2f}\n    {r.title}\n    {r.content[:400]}"
            )

    if not context:
        result = {"enabled": True, "pulse": None, "footnotes": [],
                  "message": "No reliable market sources available right now.",
                  "budget": websearch.budget_status()}
        return result

    valid_citations = set(range(1, len(registry.footnotes()) + 1))
    pulse = await _synthesise(context, valid_citations)
    result = {
        "enabled": True,
        "pulse": pulse,
        "footnotes": registry.footnotes(),
        "budget": websearch.budget_status(),
    }
    if pulse:
        cache.write(key, result)
    return result


def _citations_ok(text: str, valid: set[int]) -> bool:
    """True only if the item cites at least one source and every cited number is real."""
    nums: list[int] = []
    for grp in _CITE_RE.findall(text):
        nums += [int(p.strip()) for p in grp.split(",") if p.strip().isdigit()]
    return bool(nums) and all(n in valid for n in nums)


def _clean_pulse(data: object, valid: set[int]) -> dict | None:
    """Trust nothing from the model: validate shape, tones, kinds, and citation integrity.

    Drops any item that invents a citation number not backed by a real source, so a
    hallucinated [5] can never reach the UI. Returns None if nothing usable survives.
    """
    if not isinstance(data, dict):
        return None
    mood = data.get("mood")
    if not isinstance(mood, dict) or not mood.get("label") or not mood.get("summary"):
        return None
    clean_mood = {
        "label": str(mood["label"]).strip()[:60],
        "tone": mood.get("tone") if mood.get("tone") in _VALID_TONES else "neutral",
        "summary": str(mood["summary"]).strip()[:300],
    }

    sections: list[dict] = []
    for sec in data.get("sections", []) or []:
        if not isinstance(sec, dict) or sec.get("kind") not in _VALID_KINDS:
            continue
        items: list[dict] = []
        for it in (sec.get("items") or []):
            if not isinstance(it, dict):
                continue
            text = str(it.get("text", "")).strip()
            if not text or not _citations_ok(text, valid):
                continue
            items.append({
                "text": text[:400],
                "tone": it.get("tone") if it.get("tone") in _VALID_TONES else "neutral",
            })
            if len(items) >= 4:
                break
        if items:
            sections.append({
                "kind": sec["kind"],
                "title": str(sec.get("title", "")).strip()[:80],
                "items": items,
            })

    return {"mood": clean_mood, "sections": sections} if sections else None


async def _synthesise(context: list[str], valid_citations: set[int]) -> dict | None:
    import json

    from app.agent.llm_provider import get_chat_model

    try:
        llm = get_chat_model()
        user = "Write the market pulse from these sources:\n\n" + "\n\n".join(context)
        resp = await llm.ainvoke([("system", _SYSTEM), ("human", user)])
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            return None
        return _clean_pulse(json.loads(text[start : end + 1]), valid_citations)
    except Exception:
        return None
