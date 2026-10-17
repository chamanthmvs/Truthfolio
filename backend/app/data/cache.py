"""Tiny, dependency-free file cache with TTL.

Used to avoid hammering AMFI / mfapi.in on every request. Values are JSON-serialisable.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from app.config import get_settings


def _path_for(key: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in key)
    return get_settings().cache_dir / f"{safe}.json"


def read(key: str, ttl_seconds: float) -> Any | None:
    path = _path_for(key)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    if time.time() - payload.get("_ts", 0) > ttl_seconds:
        return None
    return payload.get("data")


def write(key: str, data: Any) -> None:
    path = _path_for(key)
    try:
        path.write_text(json.dumps({"_ts": time.time(), "data": data}))
    except OSError:
        pass  # cache is best-effort; never fail the request over it
