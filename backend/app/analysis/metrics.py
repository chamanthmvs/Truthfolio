"""Deterministic quantitative metrics computed directly from the NAV series.

Design principle: *every number a verdict leans on is computed here*, from clean
AMFI/mfapi NAV data. The LLM layer may explain and weigh these numbers but never
invents them. All functions are pure and unit-testable.

Returns are derived from daily NAV. For risk statistics we use daily simple returns
annualised by trading-day count (252), which is the market-standard convention.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.config import get_settings
from app.data.navapi import NavSeries

TRADING_DAYS = 252


@dataclass(slots=True)
class Metric:
    key: str
    label: str
    value: float | None
    unit: str  # "%", "ratio", "x", "years"
    # Populated later from the explainer catalog so the UI always ships meaning with number.
    good_direction: str = "higher"  # "higher" | "lower"

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "value": None if self.value is None else round(self.value, 4),
            "unit": self.unit,
            "good_direction": self.good_direction,
        }


@dataclass(slots=True)
class RollingReturnStat:
    window_years: int
    observations: int
    min_cagr: float
    median_cagr: float
    max_cagr: float
    pct_negative: float  # share of windows with a negative annualised return

    def as_dict(self) -> dict:
        return {
            "window_years": self.window_years,
            "observations": self.observations,
            "min_cagr": round(self.min_cagr, 4),
            "median_cagr": round(self.median_cagr, 4),
            "max_cagr": round(self.max_cagr, 4),
            "pct_negative": round(self.pct_negative, 4),
        }


@dataclass(slots=True)
class MetricsReport:
    code: str
    as_of: date
    inception: date
    history_years: float
    latest_nav: float
    metrics: list[Metric] = field(default_factory=list)
    rolling: list[RollingReturnStat] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "code": self.code,
            "as_of": self.as_of.isoformat(),
            "inception": self.inception.isoformat(),
            "history_years": round(self.history_years, 2),
            "latest_nav": round(self.latest_nav, 4),
            "metrics": [m.as_dict() for m in self.metrics],
            "rolling": [r.as_dict() for r in self.rolling],
        }

    def metric(self, key: str) -> Metric | None:
        return next((m for m in self.metrics if m.key == key), None)


def _to_series(nav: NavSeries) -> pd.Series:
    idx = pd.to_datetime([p.on for p in nav.points])
    s = pd.Series([p.nav for p in nav.points], index=idx, dtype="float64")
    return s[~s.index.duplicated(keep="last")].sort_index()


def _nav_on_or_before(s: pd.Series, target: pd.Timestamp) -> float | None:
    window = s.loc[:target]
    return float(window.iloc[-1]) if not window.empty else None


def _cagr(start_nav: float, end_nav: float, years: float) -> float | None:
    if start_nav <= 0 or years <= 0:
        return None
    return (end_nav / start_nav) ** (1.0 / years) - 1.0


def _trailing_return(s: pd.Series, years: float) -> float | None:
    end_ts = s.index[-1]
    target = end_ts - pd.DateOffset(years=int(years)) if years >= 1 else end_ts - pd.Timedelta(
        days=int(round(years * 365))
    )
    start_nav = _nav_on_or_before(s, target)
    if start_nav is None:
        return None
    end_nav = float(s.iloc[-1])
    if years >= 1:
        return _cagr(start_nav, end_nav, years)
    return end_nav / start_nav - 1.0  # absolute return for sub-1y periods


def _rolling_stat(s: pd.Series, window_years: int) -> RollingReturnStat | None:
    """Monthly-stepped rolling CAGR over `window_years`. Honest because it shows the
    *distribution* of outcomes an investor could have experienced, not one lucky endpoint."""
    monthly = s.resample("MS").first().dropna()
    if len(monthly) < window_years * 12 + 1:
        return None
    cagrs: list[float] = []
    offset = pd.DateOffset(years=window_years)
    for start_ts, start_nav in monthly.items():
        end_target = start_ts + offset
        future = monthly.loc[end_target:]
        if future.empty:
            continue
        end_nav = float(future.iloc[0])
        c = _cagr(float(start_nav), end_nav, window_years)
        if c is not None:
            cagrs.append(c)
    if len(cagrs) < 3:
        return None
    arr = np.array(cagrs)
    return RollingReturnStat(
        window_years=window_years,
        observations=len(arr),
        min_cagr=float(arr.min()),
        median_cagr=float(np.median(arr)),
        max_cagr=float(arr.max()),
        pct_negative=float((arr < 0).mean()),
    )


def _daily_returns(s: pd.Series) -> np.ndarray:
    return s.pct_change().dropna().to_numpy()


def _annualised_vol(rets: np.ndarray) -> float | None:
    if rets.size < 2:
        return None
    return float(np.std(rets, ddof=1) * np.sqrt(TRADING_DAYS))


def _sharpe(rets: np.ndarray, rf_annual: float) -> float | None:
    if rets.size < 2:
        return None
    ann_ret = float(np.mean(rets) * TRADING_DAYS)
    ann_vol = _annualised_vol(rets)
    if not ann_vol:
        return None
    return (ann_ret - rf_annual) / ann_vol


def _sortino(rets: np.ndarray, rf_annual: float) -> float | None:
    if rets.size < 2:
        return None
    ann_ret = float(np.mean(rets) * TRADING_DAYS)
    downside = rets[rets < 0]
    if downside.size < 2:
        return None
    downside_dev = float(np.std(downside, ddof=1) * np.sqrt(TRADING_DAYS))
    if downside_dev == 0:
        return None
    return (ann_ret - rf_annual) / downside_dev


def _max_drawdown(s: pd.Series) -> float | None:
    if s.empty:
        return None
    running_max = s.cummax()
    drawdown = s / running_max - 1.0
    return float(drawdown.min())  # negative number, e.g. -0.42 = 42% peak-to-trough


def compute_metrics(nav: NavSeries) -> MetricsReport:
    settings = get_settings()
    s = _to_series(nav)
    rets = _daily_returns(s)
    inception = s.index[0].date()
    as_of = s.index[-1].date()
    history_years = (as_of - inception).days / 365.25

    metrics: list[Metric] = [
        Metric("ret_1y", "1-Year Return", _trailing_return(s, 1), "%"),
        Metric("ret_3y", "3-Year Return (annualised)", _trailing_return(s, 3), "%"),
        Metric("ret_5y", "5-Year Return (annualised)", _trailing_return(s, 5), "%"),
        Metric(
            "ret_since_inception",
            "Since-Inception CAGR",
            _cagr(float(s.iloc[0]), float(s.iloc[-1]), history_years),
            "%",
        ),
        Metric("volatility", "Volatility (annualised)", _annualised_vol(rets), "%", "lower"),
        Metric("sharpe", "Sharpe Ratio", _sharpe(rets, settings.risk_free_rate), "ratio"),
        Metric("sortino", "Sortino Ratio", _sortino(rets, settings.risk_free_rate), "ratio"),
        Metric("max_drawdown", "Maximum Drawdown", _max_drawdown(s), "%", "lower"),
    ]

    rolling = [r for yr in (3, 5) if (r := _rolling_stat(s, yr)) is not None]

    return MetricsReport(
        code=nav.code,
        as_of=as_of,
        inception=inception,
        history_years=history_years,
        latest_nav=float(s.iloc[-1]),
        metrics=metrics,
        rolling=rolling,
    )
