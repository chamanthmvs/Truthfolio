"""Metric explainer catalog.

The promise of the product is that we never show a number we can't explain. Each
metric gets: what it means, why it matters, how to read it, and dynamic interpretation
bands that turn the raw value into a plain-language verdict ("strong", "concerning", …).

Bands are deliberately conservative and transparent — they are heuristics for *reading*
a number, not buy/sell signals. The final Continue/Stop/Shift call is made by the agent
weighing the whole evidence ledger, not any single band.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Band:
    # Interpret value (already in native units: fraction for %, raw for ratios) against
    # an ordered list of (upper_bound, label, tone). First band whose bound the value is
    # <= to wins; last band is the catch-all with bound = +inf.
    label: str
    tone: str  # "positive" | "neutral" | "caution" | "negative"


@dataclass(slots=True)
class Explainer:
    key: str
    plain: str  # child-level, one line, with an everyday analogy — shown FIRST, always
    meaning: str
    why_it_matters: str
    how_to_read: str
    thresholds: list[tuple[float, str, str]]  # (upper_bound, label, tone)

    def interpret(self, value: float | None) -> dict:
        if value is None:
            return {"label": "Not enough data", "tone": "neutral"}
        for bound, label, tone in self.thresholds:
            if value <= bound:
                return {"label": label, "tone": tone}
        return {"label": self.thresholds[-1][1], "tone": self.thresholds[-1][2]}


# Thresholds use fractions for % metrics (0.12 == 12%) and raw values for ratios.
_INF = float("inf")

CATALOG: dict[str, Explainer] = {
    "ret_1y": Explainer(
        key="ret_1y",
        plain="How much your money grew (or shrank) in just the last year — like measuring "
        "how much a plant grew since last birthday. One year is too short to really judge it.",
        meaning="The change in the fund's value over the last 12 months.",
        why_it_matters="It's recent news, but one year is mostly luck and mood of the market "
        "— not proof the fund is good or bad.",
        how_to_read="Don't judge the fund on this alone. A single good or bad year is noise. "
        "Look at the longer numbers below.",
        thresholds=[(0.0, "Lost money this year", "caution"), (0.12, "Small growth", "neutral"),
                    (0.20, "Good growth", "positive"), (_INF, "Very strong", "positive")],
    ),
    "ret_3y": Explainer(
        key="ret_3y",
        plain="The average speed your money grew each year over 3 years — like a car that "
        "averaged 60 km/h: some stretches faster, some slower, this is the typical pace.",
        meaning="The average yearly growth rate over the last 3 years.",
        why_it_matters="Three years is long enough to start seeing the real pace, not just "
        "one lucky or unlucky year.",
        how_to_read="Compare it to similar funds (see the peer section). Beating similar "
        "funds matters more than the number by itself.",
        thresholds=[(0.0, "Shrank", "negative"), (0.08, "Slow", "caution"),
                    (0.15, "Healthy pace", "positive"), (_INF, "Excellent", "positive")],
    ),
    "ret_5y": Explainer(
        key="ret_5y",
        plain="The average yearly growth over 5 years — a longer, more trustworthy look. "
        "Like judging a student by 5 report cards instead of one test.",
        meaning="The average yearly growth rate over the last 5 years.",
        why_it_matters="Five years covers good times and bad times, so it's one of the most "
        "honest signs of whether the fund is actually any good.",
        how_to_read="This is a big input to the Continue/Shift decision. Steadily beating or "
        "trailing similar funds here is a strong signal.",
        thresholds=[(0.0, "Shrank", "negative"), (0.08, "Slow", "caution"),
                    (0.14, "Healthy pace", "positive"), (_INF, "Excellent", "positive")],
    ),
    "ret_since_inception": Explainer(
        key="ret_since_inception",
        plain="The average yearly growth since the fund was born — its whole life story in "
        "one number, like a lifetime batting average.",
        meaning="The average yearly growth rate since the fund first started.",
        why_it_matters="Shows the long track record, but the distant past matters less than "
        "how it's doing now.",
        how_to_read="Nice for history, but weigh the recent 3- and 5-year numbers more — a "
        "great old record means little if things changed recently.",
        thresholds=[(0.0, "Shrank", "negative"), (0.08, "Slow", "caution"),
                    (0.13, "Healthy pace", "positive"), (_INF, "Excellent", "positive")],
    ),
    "volatility": Explainer(
        key="volatility",
        plain="How bumpy the ride is. A calm fund is a smooth road; a bumpy one feels like "
        "an off-road trip. Bumps aren't bad — if they take you somewhere good.",
        meaning="How much the fund's value jumps up and down along the way.",
        why_it_matters="Big swings can scare people into selling at the worst time. Bumpiness "
        "is only okay if you're well rewarded for it.",
        how_to_read="Smaller means calmer. Always read it next to the 'bumpy ride worth it?' "
        "score below — bumps are fine if that score is high.",
        thresholds=[(0.12, "Calm ride", "positive"), (0.18, "Some bumps", "neutral"),
                    (0.25, "Bumpy", "caution"), (_INF, "Very bumpy", "negative")],
    ),
    "sharpe": Explainer(
        key="sharpe",
        plain="Was the bumpy ride worth it? It weighs how much extra you earned against how "
        "bumpy the ride was. Higher means you got well paid for the bumps.",
        meaning="How much reward the fund gave for the amount of ups-and-downs it put you "
        "through (compared to a totally safe option like a bank/government deposit).",
        why_it_matters="Earning a lot by taking wild risks isn't skill. This checks if the "
        "reward actually justified the roller-coaster.",
        how_to_read="Higher is better. Below ~0.5 is poor, around 1.0 is good, above ~1.5 is "
        "great — but only compare funds of the same type.",
        thresholds=[(0.5, "Not worth the bumps", "caution"), (1.0, "Okay", "neutral"),
                    (1.5, "Good", "positive"), (_INF, "Great", "positive")],
    ),
    "sortino": Explainer(
        key="sortino",
        plain="Like the 'worth-it' score, but it only counts the scary downhill bumps — "
        "because nobody minds when things go up. A fairer test of the painful risk.",
        meaning="How much reward the fund gave for just its downward (painful) swings, "
        "ignoring the happy upward ones.",
        why_it_matters="You don't fear your money going up — you fear it going down. This "
        "focuses only on the risk that actually hurts.",
        how_to_read="Higher is better. If this is much higher than the 'worth-it' score, "
        "most of the fund's bumps are the happy upward kind.",
        thresholds=[(0.7, "Weak", "caution"), (1.3, "Okay", "neutral"),
                    (2.0, "Good", "positive"), (_INF, "Great", "positive")],
    ),
    "max_drawdown": Explainer(
        key="max_drawdown",
        plain="The worst drop this fund ever took, from a high point down to the low — the "
        "scariest moment you'd have lived through. Ask: could I have held on without panicking?",
        meaning="The biggest fall the fund has ever had from a peak before recovering.",
        why_it_matters="This is the real pain test. Many people panic-sell at the bottom and "
        "lock in the loss. Knowing the worst case helps you prepare for it.",
        how_to_read="Closer to zero is gentler (it's a drop, so it's a negative number). Be "
        "honest with yourself: could you stay calm through a fall this big?",
        thresholds=[(-0.50, "Brutal fall", "negative"), (-0.35, "Big fall", "caution"),
                    (-0.20, "Medium fall", "neutral"), (_INF, "Gentle", "positive")],
    ),
}


def attach(metric_key: str, value: float | None) -> dict:
    """Return the full explainer payload for a metric value, for the UI."""
    exp = CATALOG.get(metric_key)
    if exp is None:
        return {}
    return {
        "plain": exp.plain,
        "meaning": exp.meaning,
        "why_it_matters": exp.why_it_matters,
        "how_to_read": exp.how_to_read,
        "interpretation": exp.interpret(value),
    }
