"""AMFI scheme master: the validated universe of real Indian mutual-fund schemes.

AMFI publishes NAVAll.txt — a semicolon-delimited dump of every scheme with its
code, ISINs, name and current NAV, grouped under AMC + scheme-type headers. We parse
it into a searchable in-memory index so the UI can only ever let a user pick a *real*
scheme (keyed by its official AMFI code), never free-text a fund that doesn't exist.

This module is the guarantee behind "no random funds."
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field

import httpx
from rapidfuzz import fuzz, process

from app.config import get_settings
from app.data import cache

_MASTER_CACHE_KEY = "amfi_master"
_lock = asyncio.Lock()

# Filler words that carry no distinguishing signal in a fund search, so they don't count
# toward the "did the user's distinctive words actually match?" gate.
_SEARCH_STOPWORDS = {
    "fund", "funds", "the", "of", "and", "scheme", "plan", "direct", "regular",
    "growth", "idcw", "dividend", "payout", "reinvestment", "option", "mutual",
    "india", "indian", "open", "ended", "closed",
}


@dataclass(slots=True)
class Scheme:
    code: str  # AMFI scheme code (stable key used everywhere downstream)
    name: str  # full display name, e.g. "Parag Parikh Flexi Cap Fund - Direct Plan - Growth"
    base_name: str  # fund name without plan/option, e.g. "Parag Parikh Flexi Cap Fund"
    amc: str  # fund house, parsed from section headers
    scheme_type: str  # e.g. "Open Ended Schemes(Equity Scheme - Large Cap Fund)"
    category: str  # distilled peer-group label, e.g. "Large Cap Fund"
    plan: str = ""  # "Direct Plan" | "Regular Plan"
    option: str = ""  # "Growth" | "IDCW" | ...
    isin_growth: str | None = None
    isin_reinvest: str | None = None

    @property
    def is_direct(self) -> bool:
        return "direct" in self.plan.lower()

    @property
    def is_growth(self) -> bool:
        o = self.option.lower()
        return "growth" in o or ("idcw" not in o and "dividend" not in o and "reinvest" not in o)

    def as_dict(self) -> dict:
        return {
            "code": self.code,
            "name": self.name,
            "base_name": self.base_name,
            "amc": self.amc,
            "scheme_type": self.scheme_type,
            "category": self.category,
            "plan": self.plan,
            "option": self.option,
        }


@dataclass
class SchemeMaster:
    schemes: list[Scheme] = field(default_factory=list)
    _by_code: dict[str, Scheme] = field(default_factory=dict)
    _by_isin: dict[str, Scheme] = field(default_factory=dict)
    # Parallel list of lowercased "name | amc" strings for fast fuzzy matching.
    _search_corpus: list[str] = field(default_factory=list)

    def index(self) -> None:
        self._by_code = {s.code: s for s in self.schemes}
        self._by_isin = {}
        for s in self.schemes:
            for isin in (s.isin_growth, s.isin_reinvest):
                if isin:
                    self._by_isin.setdefault(isin.strip().upper(), s)
        self._search_corpus = [f"{s.base_name} | {s.amc}".lower() for s in self.schemes]

    def get(self, code: str) -> Scheme | None:
        return self._by_code.get(str(code))

    def by_isin(self, isin: str) -> Scheme | None:
        return self._by_isin.get(isin.strip().upper()) if isin else None

    def search(self, query: str, limit: int = 12) -> list[Scheme]:
        q = query.strip().lower()
        if len(q) < 2:
            return []

        # Precision gate: a fund is only a candidate if it actually contains the DISTINCTIVE
        # words the user typed (ignoring filler like "fund", "direct", "growth"). This is what
        # makes a made-up name — e.g. "Tesla Moon Fund" — return nothing instead of fuzzy
        # noise, while still matching real partial/reordered/mis-cased queries. Substring
        # checks also make prefixes work ("flex" ⊂ "flexi", "parik" ⊂ "parikh").
        tokens = [t for t in re.split(r"[^a-z0-9&]+", q) if t]
        meaningful = [t for t in tokens if t not in _SEARCH_STOPWORDS and len(t) >= 2]

        def passes_gate(text: str) -> bool:
            if not meaningful:  # user typed only filler words — let fuzzy decide
                return True
            present = sum(1 for t in meaningful if t in text)
            return present / len(meaningful) >= 0.6

        # token_set_ratio handles out-of-order words ("flexi parag" -> "Parag Parikh Flexi Cap").
        matches = process.extract(
            q,
            self._search_corpus,
            scorer=fuzz.token_set_ratio,
            limit=limit * 6,
            score_cutoff=45,
        )
        # Collapse the 4 plan/option variants of each fund into one row, preferring the
        # Direct-Growth plan (what a cost-conscious long-term investor should hold / compare).
        best_by_fund: dict[str, tuple[float, Scheme]] = {}
        order: list[str] = []
        for text, score, idx in matches:
            if not passes_gate(text):
                continue
            scheme = self.schemes[idx]
            key = scheme.base_name.lower()
            preference = (
                score
                + (10 if scheme.is_direct else 0)
                + (5 if scheme.is_growth else 0)
            )
            if key not in best_by_fund:
                order.append(key)
                best_by_fund[key] = (preference, scheme)
            elif preference > best_by_fund[key][0]:
                best_by_fund[key] = (preference, scheme)
        return [best_by_fund[k][1] for k in order][:limit]


def _distil_category(scheme_type: str) -> str:
    """Extract a clean peer-group label from AMFI's verbose section header."""
    # Typical: "Open Ended Schemes(Equity Scheme - Large Cap Fund)"
    inner = scheme_type
    if "(" in scheme_type and ")" in scheme_type:
        inner = scheme_type[scheme_type.index("(") + 1 : scheme_type.rindex(")")]
    if " - " in inner:
        inner = inner.split(" - ", 1)[1]
    return inner.strip() or scheme_type.strip()


def parse_navall(text: str) -> list[Scheme]:
    """Parse AMFI's NAVAll.txt into Scheme records.

    Portal format is semicolon-delimited with 8 columns:
        Scheme Code;ISIN Growth;ISIN Reinvest;Scheme Name;Plan;Option;NAV;Date
    Section banners (scheme type) and AMC names appear as delimiter-less header lines.
    (Older feeds used 6 columns with plan/option folded into the name; we handle both.)
    """
    schemes: list[Scheme] = []
    current_type = ""
    current_amc = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if ";" not in line:
            # Header line: either a scheme-type banner or an AMC name.
            if "Scheme" in line and "(" in line:
                current_type = line
            else:
                current_amc = line
            continue
        parts = [p.strip() for p in line.split(";")]
        if len(parts) < 5 or parts[0].lower() == "scheme code":
            continue
        code = parts[0]
        if not code.isdigit():
            continue
        isin1 = parts[1] or None
        isin2 = parts[2] or None
        # NAV and date are always the last two columns; the name (+plan+option in the
        # 8-col feed) is everything between the ISINs and the trailing NAV/date.
        name_parts = [p for p in parts[3:-2] if p and p != "-"]
        base_name = name_parts[0] if name_parts else parts[3]
        plan = name_parts[1] if len(name_parts) > 1 else ""
        option = name_parts[2] if len(name_parts) > 2 else ""
        full_name = " - ".join(name_parts) if name_parts else parts[3]
        schemes.append(
            Scheme(
                code=code,
                name=full_name,
                base_name=base_name,
                amc=current_amc,
                scheme_type=current_type,
                category=_distil_category(current_type),
                plan=plan,
                option=option,
                isin_growth=isin1 if isin1 and isin1 != "-" else None,
                isin_reinvest=isin2 if isin2 and isin2 != "-" else None,
            )
        )
    return schemes


_MASTER: SchemeMaster | None = None


async def _fetch_navall() -> str:
    settings = get_settings()
    async with httpx.AsyncClient(
        timeout=settings.http_timeout_seconds, follow_redirects=True
    ) as client:
        resp = await client.get(settings.amfi_nav_url)
        resp.raise_for_status()
        return resp.text


async def get_master(force: bool = False) -> SchemeMaster:
    """Return the cached, indexed scheme master, refreshing from AMFI if stale."""
    global _MASTER
    if _MASTER is not None and not force:
        return _MASTER
    async with _lock:
        if _MASTER is not None and not force:
            return _MASTER
        settings = get_settings()
        ttl = settings.amfi_master_ttl_hours * 3600
        cached = None if force else cache.read(_MASTER_CACHE_KEY, ttl)
        if cached is None:
            text = await _fetch_navall()
            schemes = parse_navall(text)
            cache.write(_MASTER_CACHE_KEY, [s.as_dict() | {
                "isin_growth": s.isin_growth, "isin_reinvest": s.isin_reinvest,
            } for s in schemes])
        else:
            schemes = [
                Scheme(
                    code=d["code"], name=d["name"], base_name=d.get("base_name", d["name"]),
                    amc=d["amc"], scheme_type=d["scheme_type"], category=d["category"],
                    plan=d.get("plan", ""), option=d.get("option", ""),
                    isin_growth=d.get("isin_growth"), isin_reinvest=d.get("isin_reinvest"),
                )
                for d in cached
            ]
        master = SchemeMaster(schemes=schemes)
        master.index()
        _MASTER = master
        return _MASTER
