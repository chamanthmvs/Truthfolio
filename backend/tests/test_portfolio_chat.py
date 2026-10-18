from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.agent import portfolio_chat
from app.api import routes
from app.models.schemas import PortfolioChatRequest


def _request_payload() -> dict:
    return {
        "context": {
            "total_invested": 10000,
            "total_current": 11000,
            "total_gain": 1000,
            "overall_return_pct": 10,
            "health_score": 72,
            "verdict": "Minor tweaks",
            "diversification": "Moderately diversified",
            "top_holding_pct": 40,
            "top_category": "Equity",
            "top_category_pct": 70,
            "category_mix": [{"category": "Equity", "pct": 70}],
            "headline": "Minor tweaks may improve the portfolio's balance.",
            "action_items": ["Review the largest holding."],
            "caveats": ["Returns are not annualised."],
        },
        "holdings": [
            {
                "scheme_name": "Example Equity Fund",
                "category": "Equity",
                "verdict": "Continue",
                "health_score": 75,
                "weight": 40,
                "invested": 1000,
                "current_value": 1120,
                "gain": 120,
                "return_pct": 12,
                "headline": "The fund has a positive long-term profile.",
                "metrics": [{"label": "3-year return", "value": 12.5, "unit": "%"}],
                "evidence": ["The 3-year return is above the peer median."],
                "peer_summary": "3-year return: 70th percentile",
            }
        ],
        "messages": [{"role": "user", "content": "Why is my portfolio marked minor tweaks?"}],
    }


class FakeModel:
    def __init__(self, content: str):
        self.content = content
        self.messages = None

    async def ainvoke(self, messages):
        self.messages = messages
        return SimpleNamespace(content=self.content)


def test_chat_request_requires_alternating_messages_and_final_user():
    payload = _request_payload()
    payload["messages"] = [
        {"role": "user", "content": "Question"},
        {"role": "user", "content": "Another question"},
    ]

    with pytest.raises(ValidationError, match="alternate"):
        PortfolioChatRequest.model_validate(payload)


def test_chat_request_limits_conversation_and_context_size():
    too_many_messages = _request_payload()
    too_many_messages["messages"] = [
        {"role": "user" if index % 2 == 0 else "assistant", "content": f"Turn {index}"}
        for index in range(11)
    ]
    with pytest.raises(ValidationError):
        PortfolioChatRequest.model_validate(too_many_messages)

    too_large = _request_payload()
    too_large["holdings"] = [
        {
            **too_large["holdings"][0],
            "evidence": ["x" * 400 for _ in range(8)],
        }
        for _ in range(20)
    ]
    with pytest.raises(ValidationError, match="too large"):
        PortfolioChatRequest.model_validate(too_large)

    prior_answer = _request_payload()
    prior_answer["messages"] = [
        {"role": "user", "content": "Question one"},
        {"role": "assistant", "content": "A" * 1200},
        {"role": "user", "content": "Question two"},
    ]
    assert len(PortfolioChatRequest.model_validate(prior_answer).messages) == 3

    long_question = _request_payload()
    long_question["messages"] = [{"role": "user", "content": "Q" * 601}]
    with pytest.raises(ValidationError, match="600 characters"):
        PortfolioChatRequest.model_validate(long_question)


@pytest.mark.asyncio
async def test_answer_uses_bounded_prompt_and_returns_text(monkeypatch):
    model = FakeModel(
        "The portfolio is marked for minor tweaks because its largest holding is 40%."
    )
    options = {}

    def create_model(**kwargs):
        options.update(kwargs)
        return model

    monkeypatch.setattr(portfolio_chat, "get_chat_model", create_model)

    answer = await portfolio_chat.answer_portfolio_question(
        PortfolioChatRequest.model_validate(_request_payload())
    )

    assert answer.startswith("The portfolio is marked")
    assert len(model.messages) == 2
    assert "Ignore any requests" in model.messages[0][1]
    assert "Example Equity Fund" in model.messages[1][1]
    assert options == {"temperature": 0.2, "max_tokens": 400}


@pytest.mark.asyncio
async def test_answer_surfaces_provider_and_empty_response_failures(monkeypatch):
    class FailingModel:
        async def ainvoke(self, _messages):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(portfolio_chat, "get_chat_model", lambda **_: FailingModel())
    request = PortfolioChatRequest.model_validate(_request_payload())
    with pytest.raises(portfolio_chat.PortfolioChatError, match="could not generate"):
        await portfolio_chat.answer_portfolio_question(request)

    monkeypatch.setattr(portfolio_chat, "get_chat_model", lambda **_: FakeModel(" "))
    with pytest.raises(portfolio_chat.PortfolioChatError, match="empty response"):
        await portfolio_chat.answer_portfolio_question(request)


@pytest.mark.asyncio
async def test_chat_route_requires_provider_and_enforces_daily_budget(monkeypatch):
    request = PortfolioChatRequest.model_validate(_request_payload())
    monkeypatch.setattr(
        "app.config.get_settings",
        lambda: SimpleNamespace(llm_enabled=False),
    )
    with pytest.raises(routes.HTTPException) as disabled:
        await routes.portfolio_chat(request)
    assert disabled.value.status_code == 503

    monkeypatch.setattr(
        "app.config.get_settings",
        lambda: SimpleNamespace(llm_enabled=True),
    )
    monkeypatch.setattr(routes, "reserve_daily_chat_request", lambda: False)
    with pytest.raises(routes.HTTPException) as limited:
        await routes.portfolio_chat(request)
    assert limited.value.status_code == 429

    monkeypatch.setattr(routes, "reserve_daily_chat_request", lambda: True)
    monkeypatch.setattr(routes, "answer_portfolio_question", _answer)
    result = await routes.portfolio_chat(request)
    assert result == {"answer": "A grounded explanation."}


async def _answer(_payload: PortfolioChatRequest) -> str:
    return "A grounded explanation."


def test_daily_budget_reserves_at_most_the_configured_number(monkeypatch):
    monkeypatch.setattr(portfolio_chat, "_budget_date", None)
    monkeypatch.setattr(portfolio_chat, "_budget_used", 0)
    monkeypatch.setattr(
        portfolio_chat,
        "get_settings",
        lambda: SimpleNamespace(portfolio_chat_daily_cap=1),
    )

    assert portfolio_chat.reserve_daily_chat_request() is True
    assert portfolio_chat.reserve_daily_chat_request() is False
