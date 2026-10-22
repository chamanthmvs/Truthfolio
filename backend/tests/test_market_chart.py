from __future__ import annotations

from app.agent import market_chart


def test_build_scenarios_are_simple_fixed_rate_compounding():
    last = 400.0
    scenarios = market_chart.build_scenarios(last, years=10)

    # one band per configured rate, each starting at today's value
    assert [s["cagr"] for s in scenarios] == [0.08, 0.11, 0.14]
    for s in scenarios:
        assert s["points"][0] == {"year": 0, "value": round(last, 2)}
        assert len(s["points"]) == 11  # years 0..10 inclusive
        # year-10 value is exactly today's value compounded at the fixed rate
        expected = round(last * ((1 + s["cagr"]) ** 10), 2)
        assert s["points"][-1]["value"] == expected
        # monotonically increasing (all rates positive)
        values = [p["value"] for p in s["points"]]
        assert values == sorted(values)


def test_higher_rate_never_falls_below_a_lower_rate():
    scenarios = market_chart.build_scenarios(100.0)
    cautious, steady, buoyant = (s["points"] for s in scenarios)
    for a, b, c in zip(cautious, steady, buoyant):
        assert a["value"] <= b["value"] <= c["value"]
