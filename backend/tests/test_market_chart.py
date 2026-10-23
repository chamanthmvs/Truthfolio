from __future__ import annotations

import pandas as pd

from app.agent import market_chart


def _seg(key: str, **returns) -> dict:
    base = {"m1": None, "m3": None, "m6": None, "y1": None, "y3": None, "y5": None}
    base.update(returns)
    return {"key": key, "label": key, "returns": base}


def test_trailing_return_uses_nearest_nav_on_or_before_cutoff():
    idx = pd.to_datetime(["2026-01-01", "2026-06-01", "2026-10-01"])
    s = pd.Series([100.0, 110.0, 121.0], index=idx)
    # ~4 months back lands on the 2026-06-01 value (110) -> 121/110 - 1 = 0.10
    r = market_chart._trailing_return(s, days=120)
    assert r is not None and abs(r - 0.10) < 1e-9


def test_trailing_return_none_when_window_predates_history():
    idx = pd.to_datetime(["2026-09-01", "2026-10-01"])
    s = pd.Series([100.0, 105.0], index=idx)
    assert market_chart._trailing_return(s, days=365 * 5) is None


def test_market_read_broad_rise_is_positive_and_factual():
    segs = [
        _seg("nifty50", m3=0.04, y1=0.12),
        _seg("smallcap250", m3=0.08, y1=0.20),
        _seg("nifty500", m3=0.07, y1=0.15),
    ]
    read = market_chart._market_read(segs)
    assert read["tone"] == "positive"
    assert read["label"] == "Broadly rising"
    # headline sentence quotes the broad market's 3-month move
    assert "+7.0%" in read["sentences"][0]
    # every segment positive over 1y -> that exact line
    assert any("every segment we track is positive" in s for s in read["sentences"])


def test_market_read_broad_decline_is_negative():
    segs = [
        _seg("nifty50", m3=-0.05, y1=-0.08),
        _seg("smallcap250", m3=-0.09, y1=-0.12),
        _seg("nifty500", m3=-0.07, y1=-0.10),
    ]
    read = market_chart._market_read(segs)
    assert read["tone"] == "negative"
    assert read["label"] == "Broad decline"
    assert any("every segment we track is negative" in s for s in read["sentences"])


def test_market_read_flags_small_cap_leadership():
    segs = [
        _seg("nifty50", m3=0.01, y1=0.05),
        _seg("smallcap250", m3=0.06, y1=0.09),
        _seg("nifty500", m3=0.03, y1=0.06),
    ]
    read = market_chart._market_read(segs)
    assert any("outpaced the largest" in s for s in read["sentences"])


def test_market_read_handles_no_data():
    read = market_chart._market_read([_seg("nifty50")])
    assert read["tone"] == "neutral"
    assert read["sentences"]
