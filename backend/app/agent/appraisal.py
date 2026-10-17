"""The source-appraisal gate.

Every externally-sourced claim must pass through here before it is allowed any weight in
a verdict. This is what separates an honest reviewer from a confident-sounding one.

A source earns a reliability score (0..1) from transparent criteria: is it primary, is it
recent, is it a known-authoritative domain, and is the claim corroborated by other
independent sources? The reasons behind the score travel with it so the UI can show
*why* a piece of evidence was trusted or discounted.

Computed evidence (derived from AMFI/mfapi NAV data) bypasses web appraisal: it is primary
by construction and scored 1.0, with that stated plainly.
"""

from __future__ import annotations

from datetime import date, datetime
from urllib.parse import urlparse

from app.agent.state import SourceRef

# Domains we treat as authoritative for Indian mutual-fund facts, tiered.
_AUTHORITATIVE = {
    # regulator / industry body — highest trust
    "sebi.gov.in": 0.95,
    "amfiindia.com": 0.95,
    "rbi.org.in": 0.95,
    "bseindia.com": 0.9,
    "nseindia.com": 0.9,
    # established data/research houses
    "morningstar.in": 0.8,
    "valueresearchonline.com": 0.8,
    # mainstream financial press
    "economictimes.indiatimes.com": 0.7,
    "livemint.com": 0.7,
    "business-standard.com": 0.7,
    "moneycontrol.com": 0.65,
}
_DEFAULT_WEB_TRUST = 0.4  # unknown domain: allowed in, but deliberately low


def _domain(url: str | None) -> str:
    if not url:
        return ""
    netloc = urlparse(url).netloc.lower()
    return netloc[4:] if netloc.startswith("www.") else netloc


def computed_source(detail: str) -> SourceRef:
    """A primary, computed source — the gold standard in this system."""
    return SourceRef(
        kind="computed",
        title=detail,
        url=None,
        reliability=1.0,
        reliability_reasons=[
            "Primary: computed directly from official AMFI/mfapi NAV history",
            "Deterministic and reproducible — not a model estimate",
        ],
    )


def appraise_web_source(
    *,
    title: str,
    url: str | None,
    published: date | None,
    corroborating_sources: int,
    today: date | None = None,
) -> SourceRef:
    """Score a web source and record the reasoning. Never silently trusts anything."""
    today = today or datetime.utcnow().date()
    reasons: list[str] = []

    domain = _domain(url)
    base = _AUTHORITATIVE.get(domain, _DEFAULT_WEB_TRUST)
    if domain in _AUTHORITATIVE:
        reasons.append(f"Recognised authoritative source ({domain})")
    elif domain:
        reasons.append(f"Unrecognised domain ({domain}) — treated with caution")
    else:
        reasons.append("No verifiable URL — heavily discounted")
        base = min(base, 0.25)

    score = base

    # Recency: stale facts about funds (manager, expense ratio, mandate) can mislead.
    if published is not None:
        age_days = (today - published).days
        if age_days <= 180:
            reasons.append("Recent (within 6 months)")
            score += 0.05
        elif age_days > 730:
            reasons.append("Older than 2 years — may be outdated")
            score -= 0.15
    else:
        reasons.append("Publication date unknown — cannot confirm freshness")
        score -= 0.05

    # Corroboration: independent agreement is the strongest trust signal we have.
    if corroborating_sources >= 2:
        reasons.append(f"Corroborated by {corroborating_sources} independent sources")
        score += 0.15
    elif corroborating_sources == 1:
        reasons.append("Corroborated by 1 other source")
        score += 0.05
    else:
        reasons.append("Uncorroborated — single source only")
        score -= 0.1

    score = max(0.0, min(1.0, score))
    return SourceRef(
        kind="web",
        title=title,
        url=url,
        reliability=round(score, 2),
        reliability_reasons=reasons,
    )


# Claims whose strongest source scores below this are logged but given zero weight.
TRUST_FLOOR = 0.45
