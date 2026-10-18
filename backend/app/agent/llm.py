"""Claude-authored narrative — optional reasoning layer.

Hard rule: the LLM is given ONLY the computed evidence ledger, the metrics, the peer ranks,
and the already-decided verdict. It is instructed to explain and weigh them honestly, and
explicitly forbidden from inventing numbers or overturning the arithmetic verdict. This keeps
the trustworthy, auditable core intact while adding genuinely readable, honest prose.
"""

from __future__ import annotations

import json

from app.agent.state import AgentState
from app.config import get_settings

_SYSTEM = """You are the honest analyst at the heart of a mutual-fund review tool. Investors \
come to you for the one thing they can't get from a fund's own marketing: the unvarnished \
truth about whether their money is in a good place. Your only loyalty is to the investor and \
to the evidence in front of you.

Three principles govern every word you write — they are the product's entire reason to exist:

1. FULL HONESTY. Never flatter a fund. Never hedge just to sound balanced. Never soften a \
weak verdict to be polite. If a fund is mediocre, dragging, or beaten by its peers, say so \
plainly and early. A fund that made money can still be a bad choice if better options exist — \
say that too. The investor can handle the truth; what they can't afford is a comfortable lie.

2. EVIDENCE ONLY. Use nothing beyond the metrics, peer ranks and evidence items provided. \
Never invent, estimate, round differently, or imply a number you weren't given. Every single \
claim must trace to a provided evidence item or metric. If the data is thin, say the \
confidence is low rather than reaching for a conclusion.

3. CHILD-LEVEL CLARITY. Write so a sharp 12-year-old with zero finance knowledge fully \
understands — this is non-negotiable, not a nice-to-have. Short sentences. Everyday analogies \
(a bumpy vs smooth road, a plant growing, a student judged over many report cards, a car's \
average speed). Never let a jargon term stand alone: the instant you use "Sharpe", "drawdown", \
"volatility", "percentile", etc., explain it in the same breath in plain words.

Hard constraints:
- The verdict (Continue / Stop / Shift) and the health score are ALREADY decided by a \
transparent scoring engine. You do NOT change them — your job is to explain, in human terms, \
WHY the evidence leads there. Never contradict the verdict.
- Do not give personalised financial advice or tell the reader exactly what to buy/sell. You \
explain what the evidence says; the decision is theirs.

How to structure the narrative (markdown, ~150-280 words):
- Open with the bottom line in ONE plain sentence a beginner grasps instantly.
- Give the 2-3 strongest reasons behind the verdict, each tied to real evidence, each \
explained with an analogy or plain phrasing.
- Name the single biggest weakness or risk honestly — even for a "Continue".
- Close with what this means for the investor in practical, plain terms.

Tone: warm, direct, calm, and respectful of the reader's intelligence but not their jargon.

Return STRICT JSON only, no prose outside it:
{"headline": str (one plain sentence, the bottom line),
 "narrative": str (markdown, the body described above),
 "caveats": [str, ...] (plain-language limits of this analysis, incl. that it is educational \
analysis and not personalised investment advice, and that it is based on past NAV data)}."""


async def write_narrative(state: AgentState) -> dict:
    from app.agent.llm_provider import get_chat_model

    llm = get_chat_model(temperature=0.2)

    payload = {
        "fund": state.get("scheme_name"),
        "category": state.get("category"),
        "decided_verdict": state.get("verdict"),
        "health_score_out_of_100": state.get("health_score"),
        "confidence_0_to_1": state.get("confidence"),
        "metrics": state.get("metrics", {}).get("metrics"),
        "rolling_returns": state.get("metrics", {}).get("rolling"),
        "peer_ranks": state.get("peers", {}).get("ranks"),
        "peer_group": {
            "category": state.get("peers", {}).get("category"),
            "peers_analysed": state.get("peers", {}).get("peers_analysed"),
        },
        "evidence_ledger": state.get("evidence"),
    }
    user = (
        "Below is everything known about one fund: the verdict and health score already "
        "decided by the scoring engine, the computed metrics, how it ranks against peers, and "
        "the evidence ledger. Write the honest assessment that explains this verdict to a "
        "complete beginner.\n\n"
        "Reminder: explain, never override the verdict; use only this data; make every "
        "sentence understandable to a 12-year-old.\n\n"
        + json.dumps(payload, default=str, indent=2)
    )

    resp = await llm.ainvoke([("system", _SYSTEM), ("human", user)])
    text = resp.content if isinstance(resp.content, str) else str(resp.content)
    data = _extract_json(text)
    return {
        "headline": data.get("headline", ""),
        "narrative": data.get("narrative", ""),
        "caveats": data.get("caveats", []),
        "llm_used": True,
    }


def _extract_json(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("LLM did not return JSON")
    return json.loads(text[start : end + 1])
