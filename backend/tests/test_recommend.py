from __future__ import annotations

from app.agent import verdict as verdict_engine
from app.analysis import recommend


def _metrics(ret5y: float, sharpe: float, sortino: float, dd: float, pct_neg: float) -> dict:
    """A metrics dict shaped like MetricsReport.as_dict()."""
    return {
        "metrics": [
            {"key": "ret_5y", "label": "5-Year Return", "value": ret5y, "unit": "%", "good_direction": "higher"},
            {"key": "ret_3y", "label": "3-Year Return", "value": ret5y - 0.01, "unit": "%", "good_direction": "higher"},
            {"key": "sharpe", "label": "Sharpe", "value": sharpe, "unit": "ratio", "good_direction": "higher"},
            {"key": "sortino", "label": "Sortino", "value": sortino, "unit": "ratio", "good_direction": "higher"},
            {"key": "max_drawdown", "label": "Max Drawdown", "value": dd, "unit": "%", "good_direction": "lower"},
        ],
        "rolling": [{"window_years": 5, "pct_negative": pct_neg, "min_cagr": 0, "median_cagr": 0.1, "max_cagr": 0.2, "observations": 60}],
    }


def test_self_health_drops_peer_standing_to_avoid_recursion():
    """The core recursion-avoidance claim: with no peer ranks, peer_standing is omitted and the
    remaining four components renormalise — so a candidate can be scored without ranking its
    own peers."""
    metrics = _metrics(0.15, 1.2, 1.4, -0.25, 0.05)
    full = verdict_engine.synthesise(metrics, {"ranks": []})
    assert "peer_standing" not in full["components"]
    assert set(full["components"]) == {"long_term_return", "risk_adjusted", "consistency", "drawdown"}

    health = recommend._self_health(metrics)
    assert health is not None
    assert health == full["health_score"]
    assert 0 < health <= 100


def test_self_health_is_none_without_usable_metrics():
    assert recommend._self_health({"metrics": [], "rolling": []}) is None


def test_compare_counts_only_genuine_wins_and_writes_concrete_reasons():
    subject = {"metrics": _metrics(0.10, 0.8, 0.9, -0.40, 0.18)}
    strong = {"metrics": _metrics(0.16, 1.3, 1.5, -0.22, 0.04)}  # better on everything

    rows, reasons, won = recommend._compare(subject, strong)
    # ret_5y, ret_3y, sharpe, sortino, max_drawdown, consistency = 6 comparable rows, all won
    assert won == 6
    assert len(rows) == 6
    assert all(r["better"] for r in rows)
    assert reasons  # concrete, plain-language reasons were produced
    assert any("a year" in r for r in reasons)  # return phrasing
    assert any("worst-ever fall" in r for r in reasons)  # drawdown phrasing


def test_compare_does_not_credit_a_weaker_candidate():
    subject = {"metrics": _metrics(0.16, 1.3, 1.5, -0.22, 0.04)}
    weak = {"metrics": _metrics(0.10, 0.8, 0.9, -0.40, 0.18)}
    rows, reasons, won = recommend._compare(subject, weak)
    assert won == 0
    assert reasons == []
    assert all(not r["better"] for r in rows)


def test_consistency_prefers_the_five_year_window():
    metrics = {
        "metrics": [],
        "rolling": [
            {"window_years": 3, "pct_negative": 0.20},
            {"window_years": 5, "pct_negative": 0.05},
        ],
    }
    assert recommend._consistency(metrics) == 0.05
    assert recommend._consistency({"metrics": [], "rolling": []}) is None
