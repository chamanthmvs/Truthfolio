"""Peer-relative analysis.

'Is this fund good?' is almost meaningless in isolation — a 12% return is excellent in
a down year and poor in a bull run. The honest question is *relative*: how does this fund
rank against other funds pursuing the same mandate?

We build a peer set from the AMFI master (same distilled category, Direct+Growth plans to
compare like-with-like), compute the same metrics for each, and express the subject fund's
standing as a percentile rank within that set. Peer NAV fetches run concurrently and are
capped + cached so this stays fast and free.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from app.data import amfi, navapi
from app.analysis.metrics import Metric, compute_metrics

# Metrics for which a peer percentile is meaningful, with their "good" direction.
_RANKED_KEYS = {
    "ret_1y": "higher",
    "ret_3y": "higher",
    "ret_5y": "higher",
    "sharpe": "higher",
    "sortino": "higher",
    "volatility": "lower",
    "max_drawdown": "higher",  # less negative (shallower) is better
}

MAX_PEERS = 18  # cap concurrent NAV fetches; enough for a stable percentile


@dataclass(slots=True)
class PeerRank:
    key: str
    label: str
    value: float | None
    peer_median: float | None
    percentile: float | None  # 0..1, where 1.0 = best in peer group
    peers_counted: int

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "value": None if self.value is None else round(self.value, 4),
            "peer_median": None if self.peer_median is None else round(self.peer_median, 4),
            "percentile": None if self.percentile is None else round(self.percentile, 3),
            "peers_counted": self.peers_counted,
        }


@dataclass(slots=True)
class PeerReport:
    category: str
    peer_universe_size: int
    peers_analysed: int
    ranks: list[PeerRank] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "category": self.category,
            "peer_universe_size": self.peer_universe_size,
            "peers_analysed": self.peers_analysed,
            "ranks": [r.as_dict() for r in self.ranks],
        }

    def rank(self, key: str) -> PeerRank | None:
        return next((r for r in self.ranks if r.key == key), None)


def _is_direct_growth(scheme: amfi.Scheme) -> bool:
    return scheme.is_direct and scheme.is_growth


def _pick_peer_codes(master: amfi.SchemeMaster, subject: amfi.Scheme) -> list[str]:
    peers = [
        s for s in master.schemes
        if s.category == subject.category
        and s.code != subject.code
        and _is_direct_growth(s)
    ]
    # Spread the sample across fund houses so no single AMC dominates the peer median.
    peers.sort(key=lambda s: (s.amc, s.name))
    seen_amc: dict[str, int] = {}
    chosen: list[str] = []
    for s in peers:
        if seen_amc.get(s.amc, 0) >= 2:
            continue
        seen_amc[s.amc] = seen_amc.get(s.amc, 0) + 1
        chosen.append(s.code)
        if len(chosen) >= MAX_PEERS:
            break
    return chosen


def _percentile(value: float, pool: list[float], higher_is_better: bool) -> float:
    """Fraction of the (peers + self) pool this value is at least as good as."""
    full = pool + [value]
    if higher_is_better:
        better_or_equal = sum(1 for x in full if value >= x)
    else:
        better_or_equal = sum(1 for x in full if value <= x)
    return better_or_equal / len(full)


async def _metrics_for(code: str) -> dict[str, float | None] | None:
    try:
        nav = await navapi.get_nav_series(code)
        rep = compute_metrics(nav)
        return {m.key: m.value for m in rep.metrics}
    except Exception:
        return None  # a peer that fails to load simply drops out of the sample


async def compute_peer_report(
    subject_code: str, subject_metrics: list[Metric]
) -> PeerReport:
    master = await amfi.get_master()
    subject = master.get(subject_code)
    category = subject.category if subject else "Unknown"

    universe = [
        s for s in master.schemes
        if subject and s.category == subject.category and _is_direct_growth(s)
    ]
    codes = _pick_peer_codes(master, subject) if subject else []

    results = await asyncio.gather(*(_metrics_for(c) for c in codes))
    peer_metrics = [r for r in results if r is not None]

    subject_vals = {m.key: m.value for m in subject_metrics}
    ranks: list[PeerRank] = []
    for m in subject_metrics:
        if m.key not in _RANKED_KEYS:
            continue
        higher_better = _RANKED_KEYS[m.key] == "higher"
        pool = [pm[m.key] for pm in peer_metrics if pm.get(m.key) is not None]
        val = subject_vals.get(m.key)
        median = sorted(pool)[len(pool) // 2] if pool else None
        pct = _percentile(val, pool, higher_better) if (val is not None and pool) else None
        ranks.append(
            PeerRank(
                key=m.key, label=m.label, value=val,
                peer_median=median, percentile=pct, peers_counted=len(pool),
            )
        )

    return PeerReport(
        category=category,
        peer_universe_size=len(universe),
        peers_analysed=len(peer_metrics),
        ranks=ranks,
    )
