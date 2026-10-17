"""Sanity tests for the deterministic metric engine.

These lock the *contract* of the quant layer: a known synthetic NAV series must produce
the expected returns, drawdown, and risk statistics. If these drift, a verdict could too —
so they are the first line of trust.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from app.analysis.metrics import compute_metrics
from app.data.navapi import NavPoint, NavSeries


def _series_from_daily(start: date, navs: list[float]) -> NavSeries:
    points = [NavPoint(on=start + timedelta(days=i), nav=v) for i, v in enumerate(navs)]
    return NavSeries(
        code="TEST", scheme_name="Test Fund", fund_house=None,
        scheme_type=None, scheme_category=None, points=points,
    )


def test_steady_growth_positive_returns():
    # ~0.05% daily compounding over ~3 years of trading-ish days.
    start = date(2020, 1, 1)
    navs = [100.0 * (1.0005 ** i) for i in range(1100)]
    report = compute_metrics(_series_from_daily(start, navs))

    si = report.metric("ret_since_inception")
    assert si is not None and si.value is not None
    assert si.value > 0.10  # strong steady compounding

    dd = report.metric("max_drawdown")
    assert dd is not None and dd.value is not None
    assert dd.value >= -0.001  # monotonic growth => essentially no drawdown


def test_drawdown_is_captured():
    start = date(2020, 1, 1)
    # Rise to 200, crash to 100 (a clean 50% peak-to-trough), then recover.
    navs = [100 + i for i in range(100)]  # 100 -> 199
    navs += [199 - i * 2 for i in range(50)]  # 199 -> ~100
    navs += [100 + i for i in range(50)]
    report = compute_metrics(_series_from_daily(start, navs))

    dd = report.metric("max_drawdown")
    assert dd is not None and dd.value is not None
    assert dd.value < -0.45  # roughly -50%


def test_volatility_nonnegative_and_sane():
    start = date(2020, 1, 1)
    rng = np.random.default_rng(42)
    rets = rng.normal(0.0004, 0.01, size=800)
    nav = 100.0
    navs = []
    for r in rets:
        nav *= 1 + r
        navs.append(nav)
    report = compute_metrics(_series_from_daily(start, navs))

    vol = report.metric("volatility")
    assert vol is not None and vol.value is not None
    assert 0.05 < vol.value < 0.40  # ~0.16 annualised for 1% daily sd


def test_metric_values_round_trip_to_dict():
    start = date(2021, 1, 1)
    navs = [100.0 * (1.0003 ** i) for i in range(700)]
    report = compute_metrics(_series_from_daily(start, navs))
    d = report.as_dict()
    assert d["code"] == "TEST"
    assert any(m["key"] == "sharpe" for m in d["metrics"])
    assert d["history_years"] > 1.0
