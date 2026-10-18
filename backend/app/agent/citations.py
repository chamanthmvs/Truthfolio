"""Citation service.

Turns the sources behind web-researched claims into numbered footnotes. The agents write
claims with inline markers like `[1]`, `[2]`; this registry assigns each unique source a
stable number (deduped by URL, in first-use order) and emits the footnote list the UI renders
at the bottom of a review — each with domain, date, a reliability score, and a link.

This is the honesty USP made literal: every web-sourced sentence is traceable to a scored,
clickable source.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urlparse


def _domain(url: str | None) -> str:
    if not url:
        return ""
    net = urlparse(url).netloc.lower()
    return net[4:] if net.startswith("www.") else net


@dataclass
class CitationRegistry:
    _by_url: dict[str, int] = field(default_factory=dict)
    _entries: list[dict] = field(default_factory=list)

    def add(
        self,
        *,
        title: str,
        url: str,
        reliability: float,
        published: str | None = None,
    ) -> int:
        """Register a source, returning its citation number (deduped by URL)."""
        if url in self._by_url:
            n = self._by_url[url]
            # keep the strongest reliability / earliest title we saw
            return n
        n = len(self._entries) + 1
        self._by_url[url] = n
        self._entries.append(
            {
                "n": n,
                "title": title or _domain(url),
                "url": url,
                "domain": _domain(url),
                "reliability": round(reliability, 2),
                "published": published,
            }
        )
        return n

    def footnotes(self) -> list[dict]:
        return list(self._entries)

    def number_for(self, url: str) -> int | None:
        return self._by_url.get(url)


# Matches inline citation markers like [1] or [1,3] in agent-written text.
_MARKER = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")


def markers_in(text: str) -> list[int]:
    """Return all citation numbers referenced by inline [n] markers in a piece of text."""
    out: list[int] = []
    for m in _MARKER.finditer(text):
        for part in m.group(1).split(","):
            part = part.strip()
            if part.isdigit():
                out.append(int(part))
    return out
