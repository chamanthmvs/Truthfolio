"""Beyond the numbers — a deterministic, free "track record & resilience" read.

The quant verdict weighs returns, risk and peer standing. But a beginner also asks the
non-numeric questions: How long has this fund existed? Has it ever survived a real crash?
Is it even old enough to judge? Those are answerable *for free* from the NAV history we
already have — no web search, no LLM — so we answer them here, honestly.

Richer qualitative facts that numbers can't give (manager changes, expense ratio, mandate
drift, AUM, regulatory issues) are not in free data; those come from the cited Deep Research
path when an API key is configured.
"""

from __future__ import annotations

from app.analysis.metrics import MetricsReport
from app.data.navapi import NavSeries


def build_qualitative(nav: NavSeries, report: MetricsReport) -> dict:
    pts = nav.points
    if not pts:
        return {}

    navs = [p.nav for p in pts]
    last = navs[-1]
    peak = max(navs)
    inception = pts[0].on
    age = report.history_years

    worst = None
    for m in report.metrics:
        if m.key == "max_drawdown":
            worst = m.value  # negative fraction, e.g. -0.42
            break

    below_peak = last / peak - 1.0 if peak > 0 else 0.0
    at_highs = below_peak >= -0.02

    if age >= 10:
        label, tone = "Long, multi-cycle record", "positive"
    elif age >= 5:
        label, tone = "Medium-length record", "neutral"
    elif age >= 3:
        label, tone = "Fairly short record", "caution"
    else:
        label, tone = "Short, largely untested record", "caution"

    points: list[str] = [
        f"This fund has a {age:.1f}-year track record (since {inception.year})."
    ]

    if worst is not None:
        wpct = abs(worst) * 100
        if at_highs:
            points.append(
                f"Its worst fall so far was about {wpct:.0f}%, and it has since recovered to "
                "around its highest-ever level."
            )
        else:
            points.append(
                f"Its worst fall so far was about {wpct:.0f}%, and it is currently about "
                f"{abs(below_peak) * 100:.0f}% below its earlier peak."
            )

    if age >= 5 and worst is not None and worst <= -0.20:
        points.append(
            "It has already lived through at least one sharp market fall, so you can see how it "
            "behaves in bad times — not just good ones."
        )
    elif age < 3:
        points.append(
            "It hasn't yet been through a serious market downturn, so how it behaves in a crash "
            "is still unknown — judge it with caution."
        )

    return {
        "label": label,
        "tone": tone,
        "age_years": round(age, 1),
        "inception": inception.isoformat(),
        "points": points,
    }
