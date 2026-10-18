"""Tavily web-search client for the research + market-pulse agents.

Tavily is called directly over its REST API (no extra dependency). Results are cached briefly
to control cost. The whole module is a safe no-op when no key is configured: `search_web`
returns an empty list, so every feature that depends on it degrades gracefully rather than
breaking — which is how the app stays fully functional on free data with keys absent.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date, datetime

import httpx

from app.config import get_settings
from app.data import cache

# App-wide daily budget guard: a hard ceiling on real Tavily network calls per day, so a bug
# or a burst can never quietly drain limited credits. Cache hits don't count against it.
_call_log: dict = {"date": None, "count": 0}


def _budget_available() -> bool:
    settings = get_settings()
    today = date.today().isoformat()
    if _call_log["date"] != today:
        _call_log["date"] = today
        _call_log["count"] = 0
    return _call_log["count"] < settings.search_daily_cap


def _budget_tick() -> None:
    _call_log["count"] += 1


def budget_status() -> dict:
    settings = get_settings()
    today = date.today().isoformat()
    used = _call_log["count"] if _call_log["date"] == today else 0
    return {"used_today": used, "daily_cap": settings.search_daily_cap}


@dataclass(slots=True)
class WebResult:
    title: str
    url: str
    content: str  # snippet / extracted content
    score: float  # Tavily relevance score (0..1)
    published: date | None

    @property
    def domain(self) -> str:
        from urllib.parse import urlparse

        net = urlparse(self.url).netloc.lower()
        return net[4:] if net.startswith("www.") else net

    def as_dict(self) -> dict:
        return {
            "title": self.title,
            "url": self.url,
            "content": self.content,
            "score": round(self.score, 3),
            "published": self.published.isoformat() if self.published else None,
        }


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%a, %d %b %Y %H:%M:%S %Z", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(raw[:25], fmt).date()
        except (ValueError, TypeError):
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "")).date()
    except (ValueError, TypeError):
        return None


async def search_web(
    query: str,
    *,
    max_results: int | None = None,
    topic: str = "general",
    days: int | None = None,
) -> list[WebResult]:
    """Search the web via Tavily. Returns [] when no API key is configured.

    `topic="news"` + `days=N` restricts to recent news (used by the market-pulse agent).
    """
    settings = get_settings()
    if not settings.search_enabled:
        return []

    n = max_results or settings.search_max_results
    key = "search_" + hashlib.sha1(f"{query}|{topic}|{days}|{n}".encode()).hexdigest()[:16]
    cached = cache.read(key, settings.search_ttl_hours * 3600)
    if cached is not None:
        return [
            WebResult(
                title=r["title"], url=r["url"], content=r["content"],
                score=r["score"], published=_parse_date(r.get("published")),
            )
            for r in cached
        ]

    # Hard daily ceiling — protects limited credits even against bugs/bursts.
    if not _budget_available():
        return []

    payload: dict = {
        "api_key": settings.tavily_api_key,
        "query": query,
        "max_results": n,
        "search_depth": settings.search_depth,  # "basic" by default (cheaper)
        "include_answer": False,
        "include_raw_content": False,
        "topic": topic,
    }
    if days is not None:
        payload["days"] = days

    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            resp = await client.post(settings.tavily_base, json=payload)
            resp.raise_for_status()
            data = resp.json()
        _budget_tick()
    except (httpx.HTTPError, ValueError):
        return []  # never let a search failure break the review

    results: list[WebResult] = []
    for r in data.get("results", []):
        results.append(
            WebResult(
                title=r.get("title", "").strip(),
                url=r.get("url", ""),
                content=(r.get("content") or "").strip(),
                score=float(r.get("score", 0.0)),
                published=_parse_date(r.get("published_date")),
            )
        )
    cache.write(key, [r.as_dict() for r in results])
    return results
