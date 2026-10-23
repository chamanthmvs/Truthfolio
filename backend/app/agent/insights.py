"""Insights specialist — the "so what?" layer.

Goes beyond showing metrics: it synthesises the computed evidence (quant + peers + rolling +
any web research) into a short set of **structured, grounded insight cards** — the big
picture, genuine strengths, honest watch-outs, and what to keep an eye on. Each insight is
plain-language and tied to data the engine already produced; the LLM interprets, it never
invents numbers.

Works for a single fund and for a whole portfolio. Cached per subject (results change slowly)
so repeat views cost nothing. Degrades to a deterministic set of insights without an LLM key.
"""

from __future__ import annotations

import hashlib
import json

from app.config import get_settings
from app.data import cache

_VALID_TONES = {"positive", "neutral", "caution", "negative"}

_FUND_SYSTEM = """You are the honest analyst behind a mutual-fund reviewer. Turn the data below \
into 4-6 short INSIGHT CARDS that help a beginner truly understand this fund — the kind of \
"so what?" a thoughtful friend would point out, not a restatement of the numbers.

Rules (the product's whole point):
- FULL HONESTY: name real strengths AND real concerns plainly. A fund that made money can \
still have a weakness worth flagging.
- EVIDENCE ONLY: use only the metrics, peer ranks, rolling returns and evidence provided. \
Never invent or estimate a number. You may interpret and connect them.
- CHILD-LEVEL CLARITY: short sentences, everyday analogies, explain any term in the same \
breath. Write for someone with zero finance background.
- Do NOT contradict the given verdict; illuminate why it holds and what could change it.
- Cover a mix: the big picture, what's genuinely working, the single biggest watch-out, and \
what to monitor going forward. Don't pad.

Return STRICT JSON only: {"insights": [{"title": str (<= 8 words), "detail": str (1-2 plain \
sentences), "category": "big-picture"|"performance"|"risk"|"peer"|"consistency"|"cost"|"watch", \
"tone": "positive"|"neutral"|"caution"|"negative"}]}."""

_PORTFOLIO_SYSTEM = """You are the honest analyst behind a mutual-fund portfolio reviewer. Turn \
the portfolio summary below into 4-6 short INSIGHT CARDS a beginner can act on — about the \
portfolio AS A WHOLE, not individual funds.

Rules:
- FULL HONESTY about concentration, over-/under-diversification, laggards dragging returns, \
and lopsided allocation.
- EVIDENCE ONLY: use only the provided totals, category mix, concentration (HHI), weights and \
per-fund verdicts. Never invent numbers.
- CHILD-LEVEL CLARITY with everyday analogies (e.g. "too many eggs in one basket").
- These are observations to consider, NOT personalised buy/sell advice.
- Cover a mix: overall health, how the money is spread, the biggest risk in the mix, what's \
carrying vs dragging, and one thing worth reconsidering.

Return STRICT JSON only: {"insights": [{"title": str (<= 8 words), "detail": str (1-2 plain \
sentences), "category": "big-picture"|"allocation"|"concentration"|"performance"|"risk"|"watch", \
"tone": "positive"|"neutral"|"caution"|"negative"}]}."""


def _clean(raw: list) -> list[dict]:
    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("title") or not item.get("detail"):
            continue
        tone = item.get("tone", "neutral")
        out.append(
            {
                "title": str(item["title"]).strip(),
                "detail": str(item["detail"]).strip(),
                "category": str(item.get("category", "big-picture")).strip(),
                "tone": tone if tone in _VALID_TONES else "neutral",
            }
        )
    return out[:6]


async def _ask_llm(system: str, payload: dict) -> list[dict]:
    from app.agent.llm_provider import get_chat_model

    llm = get_chat_model()
    user = "Generate the insight cards from this data:\n\n" + json.dumps(payload, default=str, indent=2)
    resp = await llm.ainvoke([("system", system), ("human", user)])
    text = resp.content if isinstance(resp.content, str) else str(resp.content)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return []
    data = json.loads(text[start : end + 1])
    return _clean(data.get("insights", []) if isinstance(data, dict) else [])


# ----------------------------- fund insights ------------------------------

async def generate_fund_insights(state: dict) -> dict:
    settings = get_settings()
    code = state.get("scheme_code", "")
    key = f"insights_fund_{code}"
    cached = cache.read(key, 12 * 3600)
    if cached is not None:
        return cached

    if not settings.llm_enabled:
        result = {"insights": _fund_fallback(state), "llm_used": False}
        cache.write(key, result)
        return result

    payload = {
        "fund": state.get("scheme_name"),
        "category": state.get("category"),
        "verdict": state.get("verdict"),
        "health_score": state.get("health_score"),
        "metrics": state.get("metrics", {}).get("metrics"),
        "rolling_returns": state.get("metrics", {}).get("rolling"),
        "peer_ranks": state.get("peers", {}).get("ranks"),
        "evidence": [
            {"claim": e.get("claim"), "direction": e.get("direction"), "category": e.get("category")}
            for e in state.get("evidence", [])
        ],
    }
    try:
        insights = await _ask_llm(_FUND_SYSTEM, payload)
    except Exception:
        insights = _fund_fallback(state)
        result = {"insights": insights, "llm_used": False}
        return result  # don't cache a fallback that happened due to a transient error
    result = {"insights": insights, "llm_used": True}
    cache.write(key, result)
    return result


def _card_title(direction: str, claim: str) -> str:
    """A specific, varied title inferred from what the evidence is actually about."""
    c = (claim or "").lower()
    pos = direction == "positive"
    if "percentile" in c or "peers" in c:
        return "Ahead of its peers" if pos else "Behind its peers"
    if "sharpe" in c or "sortino" in c or "for the risk" in c or "risk-adjusted" in c:
        return "Well paid for the risk" if pos else "Poorly rewarded for the risk"
    if "drawdown" in c or "fall" in c or "drop" in c:
        return "Manageable worst-case" if pos else "A painful worst-case fall"
    if "rolling" in c or "negative" in c or "consisten" in c or "dipped" in c:
        return "Reliably steady" if pos else "Bumpy and inconsistent"
    if "annualis" in c or "grew" in c or "return" in c or "growth" in c:
        return "Strong long-term growth" if pos else "Lagging long-term growth"
    return "A genuine strength" if pos else "A real concern"


def _fund_fallback(state: dict) -> list[dict]:
    """Deterministic insights from the evidence ledger when no LLM is available."""
    verdict = state.get("verdict", "Inconclusive")
    tone = {"Continue": "positive", "Shift": "caution", "Stop": "negative"}.get(verdict, "neutral")
    out: list[dict] = [
        {
            "title": f"The verdict: {verdict}",
            "detail": f"A health score of {state.get('health_score', 0)}/100, computed only from "
            "official NAV data — no opinions, no guesswork.",
            "category": "big-picture",
            "tone": tone,
        }
    ]
    for e in state.get("evidence", []):
        d = e.get("direction")
        if d in ("positive", "negative"):
            out.append(
                {
                    "title": _card_title(d, e.get("claim", "")),
                    "detail": e.get("claim", ""),
                    "category": e.get("category", "performance"),
                    "tone": "positive" if d == "positive" else "caution",
                }
            )
    return out[:6]


# --------------------------- portfolio insights ---------------------------

async def generate_portfolio_insights(summary: dict, holdings_brief: list[dict]) -> dict:
    settings = get_settings()
    sig = hashlib.sha1(
        json.dumps({"s": summary, "h": holdings_brief}, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]
    key = f"insights_pf_{sig}"
    cached = cache.read(key, 12 * 3600)
    if cached is not None:
        return cached

    if not settings.llm_enabled:
        result = {"insights": _portfolio_fallback(summary), "llm_used": False}
        cache.write(key, result)
        return result

    payload = {"summary": summary, "holdings": holdings_brief}
    try:
        insights = await _ask_llm(_PORTFOLIO_SYSTEM, payload)
    except Exception:
        return {"insights": _portfolio_fallback(summary), "llm_used": False}
    result = {"insights": insights, "llm_used": True}
    cache.write(key, result)
    return result


def _portfolio_fallback(summary: dict) -> list[dict]:
    verdict = summary.get("verdict", "")
    out: list[dict] = [
        {
            "title": f"The verdict: {verdict}",
            "detail": summary.get("headline", ""),
            "category": "big-picture",
            "tone": "positive" if verdict == "Healthy" else "caution",
        },
        {
            "title": "How your money is spread",
            "detail": summary.get("diversification", ""),
            "category": "concentration",
            "tone": "neutral",
        },
    ]
    for a in summary.get("action_items", [])[:3]:
        al = a.lower()
        if "shift" in al:
            title = "Consider shifting a holding"
        elif "spread" in al or "diversif" in al or "bet" in al:
            title = "Spread your bets wider"
        elif "reconsider" in al or "weak" in al:
            title = "Reconsider a weak holding"
        else:
            title = "Worth a closer look"
        out.append({"title": title, "detail": a, "category": "watch", "tone": "caution"})
    return out[:6]
