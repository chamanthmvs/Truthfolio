from __future__ import annotations

from datetime import date, timedelta

from app.analysis import qualitative
from app.analysis.metrics import Metric, MetricsReport
from app.data.navapi import NavPoint, NavSeries


def _nav(navs: list[float], start: date) -> NavSeries:
    pts = [NavPoint(on=start + timedelta(days=i * 30), nav=v) for i, v in enumerate(navs)]
    return NavSeries(code="x", scheme_name="Test Fund", fund_house=None,
                     scheme_type=None, scheme_category=None, points=pts)


def _report(history_years: float, max_dd: float | None) -> MetricsReport:
    metrics = [] if max_dd is None else [Metric("max_drawdown", "Maximum Drawdown", max_dd, "%", "lower")]
    return MetricsReport(code="x", as_of=date(2026, 1, 1), inception=date(2013, 1, 1),
                         history_years=history_years, latest_nav=100.0, metrics=metrics)


def test_long_record_that_recovered_to_highs_is_positive():
    # rises, big fall, full recovery to a new all-time high at the end
    nav = _nav([100, 150, 90, 160, 210], start=date(2013, 1, 1))
    q = qualitative.build_qualitative(nav, _report(13.8, -0.40))
    assert q["label"] == "Long, multi-cycle record"
    assert q["tone"] == "positive"
    assert "recovered to" in q["points"][1]
    # 13.8y + a >20% fall -> the "lived through a fall" line is present
    assert any("sharp market fall" in p for p in q["points"])


def test_still_below_peak_is_reported_honestly():
    nav = _nav([100, 200, 120], start=date(2013, 1, 1))  # ends 40% below the 200 peak
    q = qualitative.build_qualitative(nav, _report(11.0, -0.40))
    assert "below its earlier peak" in q["points"][1]
    assert "40%" in q["points"][1]


def test_young_fund_is_flagged_as_untested():
    nav = _nav([100, 110, 120], start=date(2024, 6, 1))
    q = qualitative.build_qualitative(nav, _report(1.8, -0.08))
    assert q["label"] == "Short, largely untested record"
    assert q["tone"] == "caution"
    assert any("still unknown" in p for p in q["points"])


def test_empty_nav_returns_empty():
    nav = NavSeries(code="x", scheme_name="t", fund_house=None, scheme_type=None,
                    scheme_category=None, points=[])
    assert qualitative.build_qualitative(nav, _report(0.0, None)) == {}
