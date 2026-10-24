from __future__ import annotations

from app.agent import market


def _pulse(sections):
    return {"mood": {"label": "Cautiously optimistic", "tone": "positive", "summary": "Up a bit [1]."},
            "sections": sections}


def test_drops_items_with_hallucinated_citations():
    valid = {1, 2}
    data = _pulse([
        {"kind": "triggers", "title": "Drivers", "items": [
            {"text": "RBI held rates [1].", "tone": "neutral"},
            {"text": "Mystery claim [5].", "tone": "positive"},   # citation 5 does not exist
            {"text": "No citation at all.", "tone": "neutral"},    # must be cited
        ]},
    ])
    out = market._clean_pulse(data, valid)
    texts = [i["text"] for i in out["sections"][0]["items"]]
    assert texts == ["RBI held rates [1]."]


def test_unknown_kind_and_bad_tone_are_handled():
    valid = {1}
    data = _pulse([
        {"kind": "made_up", "items": [{"text": "x [1]", "tone": "positive"}]},
        {"kind": "watchouts", "title": "Risks", "items": [
            {"text": "Valuations stretched [1].", "tone": "scary"},  # invalid tone -> neutral
        ]},
    ])
    out = market._clean_pulse(data, valid)
    assert [s["kind"] for s in out["sections"]] == ["watchouts"]
    assert out["sections"][0]["items"][0]["tone"] == "neutral"


def test_returns_none_when_no_section_survives():
    assert market._clean_pulse(_pulse([
        {"kind": "triggers", "items": [{"text": "bad [9]", "tone": "neutral"}]},
    ]), {1}) is None


def test_returns_none_without_a_valid_mood():
    assert market._clean_pulse({"sections": []}, {1}) is None
