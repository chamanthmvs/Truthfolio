"""mfapi.in client: historical NAV time-series keyed by AMFI scheme code.

Returns a clean, chronologically-sorted NAV series plus the scheme metadata
(category/type/fund house) that mfapi derives. This is the raw material for every
deterministic metric — so the numbers in a verdict are computed, never guessed.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import date, datetime

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.data import cache

# Portfolio analysis fans out across many funds (and each fund across its peers). Cap the
# number of concurrent upstream NAV fetches so we stay a good citizen to mfapi.in and avoid
# connection storms, while still being fast via caching + bounded parallelism.
_FETCH_SEMAPHORE = asyncio.Semaphore(16)


@dataclass(slots=True)
class NavPoint:
    on: date
    nav: float


@dataclass(slots=True)
class NavSeries:
    code: str
    scheme_name: str
    fund_house: str | None
    scheme_type: str | None
    scheme_category: str | None
    points: list[NavPoint]  # ascending by date

    @property
    def start(self) -> date | None:
        return self.points[0].on if self.points else None

    @property
    def end(self) -> date | None:
        return self.points[-1].on if self.points else None

    @property
    def latest_nav(self) -> float | None:
        return self.points[-1].nav if self.points else None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, max=4))
async def _fetch(code: str) -> dict:
    settings = get_settings()
    url = f"{settings.mfapi_base}/{code}"
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


def _parse(code: str, payload: dict) -> NavSeries:
    meta = payload.get("meta", {}) or {}
    raw = payload.get("data", []) or []
    points: list[NavPoint] = []
    for row in raw:
        try:
            d = datetime.strptime(row["date"], "%d-%m-%Y").date()
            v = float(row["nav"])
        except (KeyError, ValueError, TypeError):
            continue
        if v <= 0:  # drop invalid/placeholder NAVs
            continue
        points.append(NavPoint(on=d, nav=v))
    points.sort(key=lambda p: p.on)
    return NavSeries(
        code=code,
        scheme_name=meta.get("scheme_name", ""),
        fund_house=meta.get("fund_house"),
        scheme_type=meta.get("scheme_type"),
        scheme_category=meta.get("scheme_category"),
        points=points,
    )


async def get_nav_series(code: str) -> NavSeries:
    settings = get_settings()
    key = f"nav_{code}"
    ttl = settings.nav_ttl_hours * 3600
    cached = cache.read(key, ttl)
    if cached is None:
        async with _FETCH_SEMAPHORE:
            payload = await _fetch(code)
        cache.write(key, payload)
    else:
        payload = cached
    series = _parse(code, payload)
    if not series.points:
        raise ValueError(f"No NAV history available for scheme {code}")
    return series
