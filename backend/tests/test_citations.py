"""Tests for the citation registry and inline-marker parsing."""

from __future__ import annotations

from app.agent.citations import CitationRegistry, markers_in


def test_registry_numbers_and_dedupes_by_url():
    reg = CitationRegistry()
    n1 = reg.add(title="A", url="https://x.com/a", reliability=0.8, published="2026-01-01")
    n2 = reg.add(title="B", url="https://y.com/b", reliability=0.6)
    n1_again = reg.add(title="A (dup)", url="https://x.com/a", reliability=0.9)

    assert (n1, n2) == (1, 2)
    assert n1_again == 1  # same URL → same number
    foot = reg.footnotes()
    assert len(foot) == 2
    assert foot[0]["domain"] == "x.com" and foot[0]["n"] == 1


def test_markers_in_parses_single_and_grouped():
    assert markers_in("Manager changed in 2024 [1]. TER is high [2,3].") == [1, 2, 3]
    assert markers_in("no citations here") == []


def test_number_for_lookup():
    reg = CitationRegistry()
    reg.add(title="A", url="https://x.com/a", reliability=0.8)
    assert reg.number_for("https://x.com/a") == 1
    assert reg.number_for("https://missing.com") is None
