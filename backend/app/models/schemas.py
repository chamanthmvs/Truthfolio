"""Pydantic request/response models for the public API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SchemeHit(BaseModel):
    code: str
    name: str
    amc: str
    category: str
    scheme_type: str


class SearchResponse(BaseModel):
    query: str
    results: list[SchemeHit]


class ReviewRequest(BaseModel):
    scheme_code: str = Field(..., description="Official AMFI scheme code (from search).")
    units: float | None = Field(None, ge=0)
    invested_amount: float | None = Field(None, ge=0)


class MetricOut(BaseModel):
    key: str
    label: str
    value: float | None
    unit: str
    good_direction: str
    # explainer payload merged in
    plain: str | None = None
    meaning: str | None = None
    why_it_matters: str | None = None
    how_to_read: str | None = None
    interpretation: dict | None = None


class HoldingInput(BaseModel):
    scheme_code: str = Field(..., description="Official AMFI scheme code (from search).")
    units: float = Field(..., gt=0, description="Units held.")
    avg_nav: float = Field(..., gt=0, description="Average NAV at which you bought.")


class PortfolioRequest(BaseModel):
    holdings: list[HoldingInput] = Field(..., min_length=1, max_length=40)


class ReviewResponse(BaseModel):
    scheme_code: str
    scheme_name: str
    category: str
    as_of: str | None
    verdict: str
    health_score: float
    confidence: float
    headline: str
    narrative: str
    caveats: list[str]
    metrics: list[MetricOut]
    rolling: list[dict]
    peers: dict
    evidence: list[dict]
    steps: list[str]
    llm_used: bool
