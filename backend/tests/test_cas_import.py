"""Tests for CAS import mapping — active-only, AMFI/ISIN mapping, cost→avg NAV, staleness.

We monkeypatch `read_cas_pdf` with synthetic statement dicts so the mapping logic is verified
deterministically without a real (PII-bearing) CAS file.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.data import cas_import
from app.data.amfi import Scheme, SchemeMaster


def _master() -> SchemeMaster:
    schemes = [
        Scheme(code="122639", name="Parag Parikh Flexi Cap Fund - Direct - Growth",
               base_name="Parag Parikh Flexi Cap Fund", amc="PPFAS", scheme_type="Equity",
               category="Flexi Cap Fund", isin_growth="INF879O01027", isin_reinvest=None),
        Scheme(code="118989", name="HDFC Mid Cap - Direct - Growth",
               base_name="HDFC Mid Cap", amc="HDFC", scheme_type="Equity",
               category="Mid Cap Fund", isin_growth="INF179K01XXX", isin_reinvest=None),
    ]
    m = SchemeMaster(schemes=schemes)
    m.index()
    return m


def _statement(stmt_to: date, schemes: list[dict]) -> dict:
    return {
        "statement_period": {"from": "2020-01-01", "to": stmt_to.isoformat()},
        "cas_type": "CAMS",
        "folios": [{"folio": "123", "amc": "X", "PAN": "SECRET", "schemes": schemes}],
    }


def test_active_only_and_amfi_mapping(monkeypatch):
    stmt = _statement(date.today(), [
        {"scheme": "Parag Parikh Flexi Cap", "amfi": "122639", "isin": "INF879O01027",
         "close": 500, "valuation": {"cost": 27500, "value": 45000, "nav": 90}},
        {"scheme": "Sold Fund", "amfi": "999999", "isin": "INFZZZ", "close": 0,
         "valuation": {"cost": 0, "value": 0, "nav": 10}},
    ])
    monkeypatch.setattr(cas_import, "read_cas_pdf", lambda *a, **k: stmt)
    res = cas_import.import_cas(b"x", "", _master())
    assert res["status"] == "ok"
    assert len(res["holdings"]) == 1  # the zero-balance (sold) fund is dropped
    h = res["holdings"][0]
    assert h["scheme"]["code"] == "122639"
    assert h["units"] == 500
    assert h["avg_nav"] == 55.0  # 27500 / 500
    # PAN / folio never leak into the result
    assert "SECRET" not in str(res)


def test_isin_fallback_and_unmatched(monkeypatch):
    stmt = _statement(date.today(), [
        {"scheme": "HDFC Mid Cap", "amfi": "", "isin": "INF179K01XXX", "close": 10,
         "valuation": {"cost": 1000, "value": 1500, "nav": 150}},
        {"scheme": "Unknown Fund", "amfi": "", "isin": "INFNOPE", "close": 5,
         "valuation": {"cost": 500, "value": 600, "nav": 120}},
    ])
    monkeypatch.setattr(cas_import, "read_cas_pdf", lambda *a, **k: stmt)
    res = cas_import.import_cas(b"x", "", _master())
    assert res["status"] == "ok"
    codes = [h["scheme"]["code"] for h in res["holdings"]]
    assert codes == ["118989"]           # mapped via ISIN
    assert res["unmatched"] == ["Unknown Fund"]


def test_stale_rejected(monkeypatch):
    stmt = _statement(date.today() - timedelta(days=200), [
        {"scheme": "X", "amfi": "122639", "close": 1, "valuation": {"cost": 10, "value": 10, "nav": 10}},
    ])
    monkeypatch.setattr(cas_import, "read_cas_pdf", lambda *a, **k: stmt)
    res = cas_import.import_cas(b"x", "", _master())
    assert res["status"] == "error" and res["reason"] == "stale"


def test_stale_warned(monkeypatch):
    stmt = _statement(date.today() - timedelta(days=45), [
        {"scheme": "X", "amfi": "122639", "close": 1, "valuation": {"cost": 10, "value": 10, "nav": 10}},
    ])
    monkeypatch.setattr(cas_import, "read_cas_pdf", lambda *a, **k: stmt)
    res = cas_import.import_cas(b"x", "", _master())
    assert res["status"] == "ok" and res["stale"] is True


def test_password_required(monkeypatch):
    def boom(*a, **k):
        raise cas_import.IncorrectPasswordError("need pwd")
    monkeypatch.setattr(cas_import, "read_cas_pdf", boom)
    res = cas_import.import_cas(b"x", "", _master())
    assert res["status"] == "password_required"
    res2 = cas_import.import_cas(b"x", "wrongpass", _master())
    assert res2["status"] == "error" and res2["reason"] == "incorrect_password"


def test_not_a_cas(monkeypatch):
    def boom(*a, **k):
        raise cas_import.CASParseError("nope")
    monkeypatch.setattr(cas_import, "read_cas_pdf", boom)
    res = cas_import.import_cas(b"x", "", _master())
    assert res["status"] == "error" and res["reason"] == "not_cas"
