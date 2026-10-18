"""API routes: fund search, single-fund review (sync + streaming)."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Body, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.agent.graph import review_fund
from app.agent.portfolio import HoldingInput, analyze_holding
from app.analysis import portfolio as agg
from app.analysis.review_view import assemble_review
from app.data import amfi
from app.models.schemas import (
    PortfolioRequest,
    ReviewRequest,
    ReviewResponse,
    SchemeHit,
    SearchResponse,
)

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/search", response_model=SearchResponse)
async def search(q: str = Query(..., min_length=2), limit: int = Query(12, ge=1, le=30)):
    """Typeahead over the validated AMFI universe — only real schemes are returnable."""
    master = await amfi.get_master()
    hits = master.search(q, limit=limit)
    return SearchResponse(
        query=q,
        results=[
            SchemeHit(
                code=s.code, name=s.name, amc=s.amc,
                category=s.category, scheme_type=s.scheme_type,
            )
            for s in hits
        ],
    )


async def _run_review(scheme_code: str, units=None, invested_amount=None) -> ReviewResponse:
    master = await amfi.get_master()
    scheme = master.get(scheme_code)
    if scheme is None:
        raise HTTPException(404, f"Scheme {scheme_code} not found in AMFI master.")
    try:
        state = await review_fund(
            scheme_code=scheme.code, scheme_name=scheme.name,
            category=scheme.category, base_name=scheme.base_name, amc=scheme.amc,
            units=units, invested_amount=invested_amount,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    return ReviewResponse(
        **assemble_review(
            scheme_code=scheme.code, scheme_name=scheme.name,
            category=scheme.category, state=state,
        )
    )


@router.post("/review", response_model=ReviewResponse)
async def review(req: ReviewRequest):
    return await _run_review(req.scheme_code, req.units, req.invested_amount)


@router.get("/research")
async def research(scheme_code: str = Query(...)):
    """On-demand web research for ONE fund. This is the only path that spends Tavily credits,
    and only when the user explicitly asks for it. Returns cited claims + numbered sources,
    or a clear 'disabled' flag when keys aren't configured."""
    from app.agent.graph import research_fund
    from app.config import get_settings
    from app.data import websearch

    settings = get_settings()
    master = await amfi.get_master()
    scheme = master.get(scheme_code)
    if scheme is None:
        raise HTTPException(404, f"Scheme {scheme_code} not found.")
    if not settings.research_enabled:
        return {
            "enabled": False,
            "reason": "Web research needs both an LLM key and a Tavily key configured.",
            "evidence": [], "footnotes": [], "budget": websearch.budget_status(),
        }
    state = await research_fund(
        scheme_code=scheme.code, scheme_name=scheme.name,
        base_name=scheme.base_name, amc=scheme.amc, category=scheme.category,
    )
    return {
        "enabled": True,
        "evidence": state.get("research_evidence", []),
        "footnotes": state.get("footnotes", []),
        "budget": websearch.budget_status(),
    }


@router.get("/insights")
async def insights(scheme_code: str = Query(...)):
    """Structured insight cards for one fund (LLM-synthesised, cached; deterministic fallback)."""
    from app.agent.graph import insights_fund

    master = await amfi.get_master()
    scheme = master.get(scheme_code)
    if scheme is None:
        raise HTTPException(404, f"Scheme {scheme_code} not found.")
    state = await insights_fund(
        scheme_code=scheme.code, scheme_name=scheme.name, category=scheme.category,
    )
    return {
        "insights": state.get("insights", []),
        "llm_used": state.get("insights_llm_used", False),
    }


@router.post("/insights/portfolio")
async def insights_portfolio(payload: dict = Body(...)):
    """Portfolio-level insight cards from an already-computed summary (+ brief holdings)."""
    from app.agent import insights as insights_mod

    summary = payload.get("summary") or {}
    holdings = payload.get("holdings") or []
    if not summary:
        raise HTTPException(422, "A portfolio summary is required.")
    result = await insights_mod.generate_portfolio_insights(summary, holdings)
    return result


@router.post("/portfolio/import")
async def portfolio_import(file: UploadFile = File(...), password: str = Form("")):
    """Parse an uploaded CAMS/KFintech CAS into reviewable holdings.

    Privacy: the file and password live only for this request — parsed in memory, never
    written to disk, never logged, never sent to the LLM/web. Only matched holdings return.
    """
    from app.config import get_settings
    from app.data import cas_import

    settings = get_settings()
    data = await file.read()
    if len(data) > settings.cas_max_bytes:
        raise HTTPException(413, "File is too large. Please upload the CAS PDF itself.")

    master = await amfi.get_master()
    try:
        result = await asyncio.to_thread(cas_import.import_cas, data, password, master)
    finally:
        # Scrub the sensitive buffers as soon as we're done with them.
        data = b""
        password = ""
    return result


@router.post("/portfolio")
async def portfolio(req: PortfolioRequest):
    """Analyze a whole portfolio: per-fund personal returns + verdicts, plus a
    portfolio-level overview (health, mix, concentration, what to reconsider)."""
    inputs = [HoldingInput(h.scheme_code, h.units, h.avg_nav) for h in req.holdings]
    results = await asyncio.gather(*(analyze_holding(h) for h in inputs))
    valid = [r for r in results if r is not None]
    if not valid:
        raise HTTPException(422, "None of the submitted funds could be analysed.")
    total = sum(h["personal"]["current_value"] for h in valid)
    for h in valid:
        h["weight"] = (h["personal"]["current_value"] / total) if total > 0 else 0.0
    return {
        "summary": agg.aggregate(valid).as_dict(),
        "holdings": valid,
        "errors": len(inputs) - len(valid),
    }


@router.post("/portfolio/stream")
async def portfolio_stream(req: PortfolioRequest):
    """Stream portfolio analysis: emit each fund as it finishes, then the final overview.
    Keeps the UI alive and honest while many funds are reviewed in parallel."""
    inputs = [HoldingInput(h.scheme_code, h.units, h.avg_nav) for h in req.holdings]

    async def event_gen():
        yield _sse("start", {"total": len(inputs)})
        tasks = [asyncio.create_task(analyze_holding(h)) for h in inputs]
        valid: list[dict] = []
        done = 0
        for coro in asyncio.as_completed(tasks):
            result = await coro
            done += 1
            if result is not None:
                valid.append(result)
                yield _sse("holding", {
                    "done": done,
                    "total": len(inputs),
                    "scheme_name": result["review"]["scheme_name"],
                    "verdict": result["review"]["verdict"],
                })
            else:
                yield _sse("holding", {"done": done, "total": len(inputs), "failed": True})
        if not valid:
            yield _sse("error", {"message": "None of the submitted funds could be analysed."})
            return
        total = sum(h["personal"]["current_value"] for h in valid)
        for h in valid:
            h["weight"] = (h["personal"]["current_value"] / total) if total > 0 else 0.0
        yield _sse("result", {
            "summary": agg.aggregate(valid).as_dict(),
            "holdings": valid,
            "errors": len(inputs) - len(valid),
        })

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@router.get("/review/stream")
async def review_stream(scheme_code: str = Query(...)):
    """Server-sent events: emit each pipeline step as it completes, then the final result.

    Lets the UI show the agent 'thinking' (gathering data, comparing peers, weighing
    evidence) instead of a dead spinner — reinforcing that a verdict is earned, not guessed.
    """

    async def event_gen():
        master = await amfi.get_master()
        scheme = master.get(scheme_code)
        if scheme is None:
            yield _sse("error", {"message": f"Scheme {scheme_code} not found."})
            return

        from app.agent.graph import build_graph

        graph = build_graph()
        initial = {
            "task": "fund_review", "plan": None,
            "scheme_code": scheme.code, "scheme_name": scheme.name,
            "base_name": scheme.base_name, "amc": scheme.amc,
            "category": scheme.category, "steps": [],
        }
        last_steps = 0
        final_state: dict = {}
        try:
            async for chunk in graph.astream(initial, stream_mode="values"):
                final_state = chunk
                steps = chunk.get("steps", [])
                for s in steps[last_steps:]:
                    yield _sse("step", {"message": s})
                last_steps = len(steps)
        except Exception as exc:
            yield _sse("error", {"message": str(exc)})
            return

        result = assemble_review(
            scheme_code=scheme.code, scheme_name=scheme.name,
            category=scheme.category, state=final_state,
        )
        yield _sse("result", result)

    return StreamingResponse(event_gen(), media_type="text/event-stream")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
