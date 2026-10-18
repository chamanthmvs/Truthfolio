"""CAS (Consolidated Account Statement) import — parse a user's statement into holdings.

Strict privacy contract (this is PAN/folio PII):
  • The PDF bytes and password exist only as local variables for the duration of the parse.
  • Nothing is written to disk, nothing is logged, nothing is sent to the LLM or any web API.
  • We keep ONLY the matched holdings (fund + units + cost) the user needs; investor name,
    PAN, email and folio numbers from the statement are never returned or stored.

Behaviour:
  • Accepts CAMS / KFintech mutual-fund CAS (password-protected or not).
  • Extracts ACTIVE holdings only (closing units > 0) — sold/exited funds are ignored.
  • Maps each holding to our validated universe by AMFI code, falling back to ISIN.
  • Freshness: warn if older than `cas_warn_days`, hard-reject beyond `cas_reject_days`.
  • Clear statuses for: needs-password, wrong-password, not-a-CAS, stale.
"""

from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from typing import Any

from casparser import read_cas_pdf
from casparser.exceptions import (
    CASParseError,
    HeaderParseError,
    IncompleteCASError,
    IncorrectPasswordError,
    ParserException,
)
from pydantic import BaseModel

from app.config import get_settings
from app.data.amfi import SchemeMaster


def _to_date(raw) -> date | None:
    if isinstance(raw, date):
        return raw
    if isinstance(raw, str) and raw:
        for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%d-%m-%Y"):
            try:
                return datetime.strptime(raw[:11], fmt).date()
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(raw).date()
        except ValueError:
            return None
    return None


def _parsed_cas_dict(parsed: Any) -> dict:
    if isinstance(parsed, BaseModel):
        return parsed.model_dump(mode="python")
    if isinstance(parsed, dict):
        return parsed
    raise TypeError(f"Unsupported CAS parser result: {type(parsed).__name__}")


def import_cas(data: bytes, password: str, master: SchemeMaster) -> dict:
    """Parse CAS bytes and return a UI-ready result. Pure w.r.t. side effects (no I/O, no log)."""
    settings = get_settings()
    pwd = password or ""

    try:
        parsed_result = read_cas_pdf(BytesIO(data), pwd, output="dict")
    except IncorrectPasswordError:
        # No password supplied → the file simply needs one. Password supplied → it was wrong.
        if not pwd:
            return {
                "status": "password_required",
                "message": "This statement is password-protected. Please enter its password.",
            }
        return {
            "status": "error",
            "reason": "incorrect_password",
            "message": "That password didn't open the statement. Please check and try again.",
        }
    except (HeaderParseError, CASParseError, IncompleteCASError, ParserException):
        return {
            "status": "error",
            "reason": "not_cas",
            "message": "This doesn't look like a CAMS/KFintech CAS. Please upload your "
            "Consolidated Account Statement (CAS) PDF.",
        }
    except Exception:
        # Encrypted PDFs can surface as a generic error from the PDF layer.
        if not pwd:
            return {
                "status": "password_required",
                "message": "This file looks protected. If it has a password, enter it and retry.",
            }
        return {
            "status": "error",
            "reason": "unreadable",
            "message": "We couldn't read this file as a CAS. Please upload a valid CAS PDF.",
        }

    parsed = _parsed_cas_dict(parsed_result)
    period = parsed.get("statement_period") or {}
    stmt_date = _to_date(period.get("to") or period.get("to_"))
    age = (date.today() - stmt_date).days if stmt_date else None

    if age is not None and age > settings.cas_reject_days:
        return {
            "status": "error",
            "reason": "stale",
            "message": f"This statement is from {stmt_date} ({age} days old). Your holdings may "
            f"have changed — please upload a CAS from the last {settings.cas_reject_days} days.",
        }

    holdings: list[dict] = []
    unmatched: list[str] = []
    for folio in parsed.get("folios", []) or []:
        for sch in folio.get("schemes", []) or []:
            try:
                close = float(sch.get("close") or 0)
            except (TypeError, ValueError):
                close = 0.0
            if close <= 0:  # active holdings only
                continue

            code = str(sch.get("amfi") or "").strip()
            scheme = master.get(code) if code else None
            if scheme is None:
                scheme = master.by_isin(str(sch.get("isin") or ""))
            if scheme is None:
                name = str(sch.get("scheme") or "").strip()
                if name:
                    unmatched.append(name)
                continue

            val = sch.get("valuation") or {}
            cost = val.get("cost")
            value = val.get("value")
            try:
                avg_nav = (float(cost) / close) if cost and close else None
            except (TypeError, ValueError):
                avg_nav = None

            holdings.append(
                {
                    "scheme": {
                        "code": scheme.code,
                        "name": scheme.name,
                        "amc": scheme.amc,
                        "category": scheme.category,
                        "scheme_type": scheme.scheme_type,
                    },
                    "units": round(close, 4),
                    "avg_nav": round(avg_nav, 4) if avg_nav else None,
                    "current_value": round(float(value), 2) if value else None,
                }
            )

    warn = age is not None and age > settings.cas_warn_days
    return {
        "status": "ok",
        "cas_type": parsed.get("cas_type"),
        "statement_date": str(stmt_date) if stmt_date else None,
        "stale": warn,
        "message": (
            f"This statement is {age} days old — your holdings may have changed since."
            if warn
            else None
        ),
        "holdings": holdings,
        "unmatched": unmatched,
    }
