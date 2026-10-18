"""Pydantic request/response models for the public API."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


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


class PortfolioChatMetric(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    value: float | None = Field(None, allow_inf_nan=False)
    unit: str = Field("", max_length=20)


class PortfolioChatHolding(BaseModel):
    scheme_name: str = Field(..., min_length=1, max_length=240)
    category: str = Field(..., max_length=120)
    verdict: str = Field(..., max_length=40)
    health_score: float = Field(..., ge=0, le=100, allow_inf_nan=False)
    weight: float = Field(..., ge=0, le=100, allow_inf_nan=False)
    invested: float = Field(..., ge=0, allow_inf_nan=False)
    current_value: float = Field(..., ge=0, allow_inf_nan=False)
    gain: float = Field(..., allow_inf_nan=False)
    return_pct: float = Field(..., allow_inf_nan=False)
    headline: str = Field(..., max_length=500)
    metrics: list[PortfolioChatMetric] = Field(default_factory=list, max_length=12)
    evidence: list[Annotated[str, Field(max_length=400)]] = Field(
        default_factory=list, max_length=8
    )
    peer_summary: str = Field("", max_length=500)


class PortfolioChatCategory(BaseModel):
    category: str = Field(..., min_length=1, max_length=120)
    pct: float = Field(..., ge=0, le=100, allow_inf_nan=False)


class PortfolioChatSummary(BaseModel):
    total_invested: float = Field(..., ge=0, allow_inf_nan=False)
    total_current: float = Field(..., ge=0, allow_inf_nan=False)
    total_gain: float = Field(..., allow_inf_nan=False)
    overall_return_pct: float = Field(..., allow_inf_nan=False)
    health_score: float = Field(..., ge=0, le=100, allow_inf_nan=False)
    verdict: str = Field(..., max_length=60)
    diversification: str = Field(..., max_length=500)
    top_holding_pct: float = Field(..., ge=0, le=100, allow_inf_nan=False)
    top_category: str = Field(..., max_length=120)
    top_category_pct: float = Field(..., ge=0, le=100, allow_inf_nan=False)
    category_mix: list[PortfolioChatCategory] = Field(default_factory=list, max_length=20)
    headline: str = Field(..., max_length=500)
    action_items: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list, max_length=10
    )
    caveats: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list, max_length=10
    )


class PortfolioChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def trim_content(cls, value: str) -> str:
        return value.strip()


class PortfolioChatRequest(BaseModel):
    context: PortfolioChatSummary
    holdings: list[PortfolioChatHolding] = Field(..., min_length=1, max_length=40)
    messages: list[PortfolioChatMessage] = Field(..., min_length=1, max_length=9)

    @model_validator(mode="after")
    def validate_conversation(self) -> PortfolioChatRequest:
        if len(self.model_dump_json().encode("utf-8")) > 50_000:
            raise ValueError("Portfolio chat context is too large.")
        if (len(self.messages) + 1) // 2 > 5:
            raise ValueError("A portfolio chat is limited to five questions.")
        for index, message in enumerate(self.messages):
            expected = "user" if index % 2 == 0 else "assistant"
            if message.role != expected:
                raise ValueError("Conversation messages must alternate user and assistant.")
            if not message.content:
                raise ValueError("Conversation messages cannot be blank.")
            if message.role == "user" and len(message.content) > 600:
                raise ValueError("User questions cannot exceed 600 characters.")
        if len(self.messages) % 2 == 0:
            raise ValueError("Conversation must end with a user question.")
        return self


class PortfolioChatResponse(BaseModel):
    answer: str = Field(..., min_length=1, max_length=2000)


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
    footnotes: list[dict] = []
    steps: list[str]
    llm_used: bool
    research_used: bool = False
