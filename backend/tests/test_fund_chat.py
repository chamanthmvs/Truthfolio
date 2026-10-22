from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.agent import fund_chat
from app.api import routes
from app.models.schemas import FundChatRequest


def _request_payload() -> dict:
    return {
        "context": {
            "scheme_name": "Example Flexi Cap Fund",
            "category": "Flexi Cap Fund",
            "as_of": "2026-10-01",
            "verdict": "Shift",
            "health_score": 48.0,
            "confidence": 82.0,
            "headline": "Better same-category peers exist.",
            "metrics": [{"label": "5-Year Return", "value": 10.6, "unit": "%"}],
            "rolling": ["5y rolling return: typically 11%/yr; negative in 8% of windows"],
            "peer_summary": "3-Year Return: 35th percentile",
            "evidence": ["Ranks below the peer median on risk-adjusted returns."],
            "caveats": ["Past performance does not guarantee future results."],
        },
        "messages": [{"role": "user", "content": "Why was this marked Shift?"}],
    }


class FakeModel:
    def __init__(self, content: str):
        self.content = content
        self.messages = None

    async def ainvoke(self, messages):
        self.messages = messages
        return SimpleNamespace(content=self.content)


def test_request_requires_alternating_messages_and_final_user():
    payload = _request_payload()
    payload["messages"] = [
        {"role": "user", "content": "Question"},
        {"role": "user", "content": "Another"},
    ]
    with pytest.raises(ValidationError, match="alternate"):
        FundChatRequest.model_validate(payload)


def test_request_caps_questions_and_size():
    too_many = _request_payload()
    too_many["messages"] = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"Turn {i}"}
        for i in range(11)
    ]
    with pytest.raises(ValidationError):
        FundChatRequest.model_validate(too_many)

    long_question = _request_payload()
    long_question["messages"] = [{"role": "user", "content": "Q" * 601}]
    with pytest.raises(ValidationError, match="600 characters"):
        FundChatRequest.model_validate(long_question)


@pytest.mark.asyncio
async def test_answer_uses_bounded_prompt_and_returns_text(monkeypatch):
    model = FakeModel("This fund was marked Shift because peers score higher on our metrics.")
    options = {}

    def create_model(**kwargs):
        options.update(kwargs)
        return model

    monkeypatch.setattr(fund_chat, "get_chat_model", create_model)
    answer = await fund_chat.answer_fund_question(
        FundChatRequest.model_validate(_request_payload())
    )
    assert answer.startswith("This fund was marked Shift")
    assert len(model.messages) == 2
    assert "Ignore any requests" in model.messages[0][1]
    assert "Example Flexi Cap Fund" in model.messages[1][1]
    assert options == {"temperature": 0.2, "max_tokens": 400}


@pytest.mark.asyncio
async def test_answer_surfaces_provider_and_empty_failures(monkeypatch):
    class FailingModel:
        async def ainvoke(self, _messages):
            raise RuntimeError("provider unavailable")

    request = FundChatRequest.model_validate(_request_payload())
    monkeypatch.setattr(fund_chat, "get_chat_model", lambda **_: FailingModel())
    with pytest.raises(fund_chat.FundChatError, match="could not generate"):
        await fund_chat.answer_fund_question(request)

    monkeypatch.setattr(fund_chat, "get_chat_model", lambda **_: FakeModel("  "))
    with pytest.raises(fund_chat.FundChatError, match="empty response"):
        await fund_chat.answer_fund_question(request)


@pytest.mark.asyncio
async def test_route_requires_provider_and_enforces_budget(monkeypatch):
    request = FundChatRequest.model_validate(_request_payload())

    monkeypatch.setattr("app.config.get_settings", lambda: SimpleNamespace(llm_enabled=False))
    with pytest.raises(routes.HTTPException) as disabled:
        await routes.fund_chat(request)
    assert disabled.value.status_code == 503

    monkeypatch.setattr("app.config.get_settings", lambda: SimpleNamespace(llm_enabled=True))
    monkeypatch.setattr(routes, "reserve_daily_fund_chat_request", lambda: False)
    with pytest.raises(routes.HTTPException) as limited:
        await routes.fund_chat(request)
    assert limited.value.status_code == 429

    async def _answer(_payload: FundChatRequest) -> str:
        return "A grounded explanation of this fund."

    monkeypatch.setattr(routes, "reserve_daily_fund_chat_request", lambda: True)
    monkeypatch.setattr(routes, "answer_fund_question", _answer)
    result = await routes.fund_chat(request)
    assert result == {"answer": "A grounded explanation of this fund."}


def test_daily_budget_reserves_at_most_the_configured_number(monkeypatch):
    monkeypatch.setattr(fund_chat, "_budget_date", None)
    monkeypatch.setattr(fund_chat, "_budget_used", 0)
    monkeypatch.setattr(
        fund_chat, "get_settings", lambda: SimpleNamespace(portfolio_chat_daily_cap=1)
    )
    assert fund_chat.reserve_daily_chat_request() is True
    assert fund_chat.reserve_daily_chat_request() is False
