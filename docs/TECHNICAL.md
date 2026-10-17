# Honest Portfolio Reviewer — Technical Document

> Internal engineering reference and build plan. For the public overview, see the
> [README](../README.md).

---

## 1. What this project is

An **evidence-backed, brutally honest reviewer** for Indian mutual-fund holdings. For any
fund — or a whole portfolio — it returns a clear verdict (**Continue / Stop / Shift** at the
fund level; **Healthy / Minor tweaks / Needs rebalancing** at the portfolio level), and every
verdict is defended by numbers that are *computed from real data*, ranked against peers, and
explained in language a complete beginner understands.

### The three product principles (the USP)

Every feature must serve all three, or it does not ship:

1. **Full honesty** — no flattery, no hedging, no sales tone. A fund that made money can still
   be a bad choice; we say so.
2. **Evidence-based** — every claim traces to a computed, source-scored fact. Nothing is
   asserted without its receipt.
3. **Child-level plain explanation** — anyone, with zero finance background, understands what
   each number means and what to do about it. Jargon is always explained in the same breath.

---

## 2. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  frontend/  Next.js 15 · React 19 · TypeScript · Tailwind · Framer     │
│                                                                        │
│   Tab: Review a fund        Tab: My portfolio                          │
│     SearchBar ─┐              PortfolioBuilder ─┐                       │
│                │                                │                       │
│     ThinkingStream (SSE)      PortfolioOverview + HoldingsTable         │
│     FundReview  ◄─────────────── drill-down ────┘                      │
└───────────────┬────────────────────────────────┬──────────────────────┘
      SSE / REST │                                │ SSE / REST
┌───────────────▼────────────────────────────────▼──────────────────────┐
│  backend/   FastAPI  (app/api/routes.py)                               │
│                                                                        │
│   data/      amfi.py      scheme master + validated typeahead search   │
│              navapi.py    mfapi.in NAV history (bounded concurrency)   │
│              cache.py     file cache with TTL                          │
│                                                                        │
│   analysis/  metrics.py   deterministic quant (returns, risk, rolling) │
│              peers.py      peer-percentile ranking                      │
│              portfolio.py  portfolio aggregation + personal returns     │
│              explainers.py child-level explainer catalog                │
│              review_view.py shared review assembler                     │
│                                                                        │
│   agent/     graph.py      LangGraph: quant→peers→evidence→synth→narr   │
│              verdict.py     transparent weighted scoring + verdict       │
│              appraisal.py   source-reliability gate                      │
│              portfolio.py   portfolio orchestrator (per-fund fan-out)    │
│              llm.py          optional Claude narrative (evidence-bound)   │
└────────────────────────────────────────────────────────────────────────┘
          Data sources (all free/public): AMFI NAVAll.txt · mfapi.in
```

### Tech stack

| Layer    | Choice                                                            |
| -------- | ----------------------------------------------------------------- |
| Backend  | Python 3.11+ (dev on 3.13), FastAPI, LangGraph, numpy, pandas     |
| Search   | rapidfuzz (fuzzy typeahead over the AMFI scheme master)           |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Framer Motion |
| LLM      | Claude via `langchain-anthropic` — optional, reasoning layer only |
| Data     | AMFI `NAVAll.txt`, `mfapi.in` — free/public                       |

---

## 3. Repository layout

```
backend/
  app/
    config.py              settings (env-overridable; zero creds needed for core)
    main.py                FastAPI app + CORS + startup warmup
    api/routes.py          all HTTP endpoints (REST + SSE)
    data/
      amfi.py              scheme master parse/index/search
      navapi.py            NAV history client (+ concurrency semaphore)
      cache.py             TTL file cache
    analysis/
      metrics.py           pure quant functions + MetricsReport
      peers.py             peer set selection + percentile ranking
      portfolio.py         personal returns + portfolio aggregation (pure)
      explainers.py        metric meaning catalog (plain + analogy)
      review_view.py       assemble a fund-review dict (shared)
    agent/
      state.py             LangGraph state + evidence model
      graph.py             graph assembly + review_fund()
      nodes.py             node implementations
      verdict.py           transparent scoring + verdict synthesis
      appraisal.py         source-reliability gate
      portfolio.py         portfolio orchestrator
      llm.py               optional Claude narrative
    models/schemas.py      Pydantic request/response models
  tests/test_metrics.py    quant contract tests
frontend/
  src/
    app/page.tsx           app shell: two tabs + flows
    app/globals.css        design tokens + glass system
    components/            SearchBar, FundReview, VerdictCard, HealthGauge,
                           MetricCard, PeerBars, RollingReturns, EvidenceLedger,
                           ThinkingStream, PortfolioBuilder, PortfolioOverview,
                           HoldingsTable
    lib/                   api.ts (fetch + SSE), types.ts, format.ts
docs/TECHNICAL.md          this document
dev.sh                     one-command local dev (both servers)
```

---

## 4. Data sources

### AMFI scheme master (`data/amfi.py`)

- Source: `https://portal.amfiindia.com/spages/NAVAll.txt` — **note the `portal.` host**;
  the old `www.amfiindia.com` 302-redirects, so the HTTP client follows redirects.
- Format is **8 semicolon-delimited columns**:
  `Scheme Code ; ISIN Growth ; ISIN Reinvest ; Scheme Name ; Plan ; Option ; NAV ; Date`,
  grouped under delimiter-less section banners (scheme type) and AMC-name lines. The parser
  handles both the 8-column feed and older 6-column variants.
- Parsed into ~14k `Scheme` records, indexed in memory, cached 24h.
- **Validated search:** `rapidfuzz` token-set matching over `"<base name> | <amc>"`, then the
  four plan/option variants of each fund are collapsed into one row, preferring the
  **Direct-Growth** plan. This is the guarantee behind "no random funds" — the UI can only
  ever select a real scheme code.

### NAV history (`data/navapi.py`)

- Source: `https://api.mfapi.in/mf/<scheme_code>` — full daily NAV history + scheme metadata.
- Parsed into an ascending `NavSeries`; invalid/zero NAVs dropped. Cached 12h.
- A module-level `asyncio.Semaphore(16)` bounds concurrent upstream fetches so portfolio
  fan-out (many funds × their peers) stays a good citizen.

---

## 5. Deterministic quant engine (`analysis/metrics.py`)

Design principle: **every number a verdict leans on is computed here**, from clean NAV data.
The LLM may explain and weigh these numbers but never invents them.

| Metric                | Definition                                                        |
| --------------------- | ----------------------------------------------------------------- |
| `ret_1y`              | Absolute return over trailing 12 months                           |
| `ret_3y` / `ret_5y`   | CAGR over trailing 3 / 5 years                                    |
| `ret_since_inception` | CAGR since first NAV                                              |
| `volatility`          | Annualised std-dev of daily returns (×√252)                       |
| `sharpe`              | (annualised return − risk-free) / annualised volatility           |
| `sortino`             | (annualised return − risk-free) / downside deviation              |
| `max_drawdown`        | Largest peak-to-trough fall                                       |
| rolling 3y / 5y       | Monthly-stepped rolling CAGR: min / median / max / % negative     |

Risk-free rate defaults to 6.5% (India short-term G-Sec), env-overridable. Rolling returns
are emphasised because they show the *distribution* of outcomes an investor could actually
have experienced, not one lucky endpoint.

Contract tests in `tests/test_metrics.py` lock the behaviour of this layer — if these drift,
a verdict could too.

---

## 6. Peer analysis (`analysis/peers.py`)

- Peer set = same distilled category, Direct-Growth plans only (like-for-like on costs),
  spread across AMCs (≤2 per house) and capped at 18 for a stable percentile.
- Each peer's metrics computed concurrently; peers that fail to load drop out of the sample.
- Output per ranked metric: subject value, peer median, and **percentile** (fraction of the
  peer-plus-self pool the fund is at least as good as), direction-aware (lower volatility and
  shallower drawdown rank *better*).

---

## 7. Transparent verdict engine (`agent/verdict.py`)

A deliberately deterministic, fully inspectable 0–100 **health score** from documented,
weighted components:

| Component           | Weight | Basis                                            |
| ------------------- | ------ | ------------------------------------------------ |
| Peer standing       | 0.30   | percentile vs same-category peers (the anchor)   |
| Risk-adjusted       | 0.26   | Sharpe / Sortino                                 |
| Long-term return    | 0.22   | 5y (or 3y) CAGR                                  |
| Consistency         | 0.14   | rolling-return behaviour, % negative windows     |
| Drawdown            | 0.08   | worst peak-to-trough fall                         |

Weights are visible and tunable; missing components are renormalised. Mapping:

- `health ≥ 62` and peer percentile ≥ 0.45 → **Continue**
- `health < 42` → **Stop** (weak on an absolute, risk-adjusted basis)
- otherwise, peer percentile < 0.45 → **Shift** (mediocre AND beaten by accessible peers)

Confidence = data completeness × evidence agreement. Why rule-based at the core? **Trust** —
a user can audit exactly why a fund scored what it did. The LLM writes the *narrative* around
this; it never overrides the arithmetic.

---

## 8. Source-appraisal gate (`agent/appraisal.py`)

Every externally-sourced claim must pass through here before it earns any weight. Computed
evidence (derived from NAV data) is **primary by construction**, scored 1.0, and bypasses web
appraisal. Web sources earn a 0–1 reliability from transparent criteria — authoritative
domain (tiered: SEBI/AMFI/RBI highest), recency, and corroboration by independent sources —
with the reasons recorded and shown in the UI. Claims below the trust floor (0.45) are logged
but given zero weight. *(The web-research fan-out that feeds this gate is the next build; the
gate itself is in place.)*

---

## 9. Portfolio layer (`analysis/portfolio.py`, `agent/portfolio.py`)

**Input per holding:** units + average buy NAV (invested is derived).

**Personal numbers (pure arithmetic):** invested = units × avg NAV; current value =
units × latest NAV; gain = current − invested; return % = gain / invested (absolute,
total-so-far — **not** annualised, because purchase dates aren't collected; stated as a
caveat).

**Aggregation:**
- Weights by current value; category mix; **HHI** (Herfindahl concentration) + top-holding
  and top-category shares.
- Portfolio health = value-weighted average of per-fund health − a transparent concentration
  penalty (0–12 pts), mapped to Healthy / Minor tweaks / Needs rebalancing.
- Best/worst performer by personal return; action items surface Shift/Stop funds with their
  weight.

**Orchestration:** `analyze_holding` runs the full fund review per holding (bounded by the
NAV semaphore); `/portfolio/stream` emits each fund as it finishes for a live UI.

Overlap is **category-level** for now (concentration by fund category). True stock-level
overlap is a later version.

---

## 10. API reference

| Method | Path                     | Purpose                                             |
| ------ | ------------------------ | --------------------------------------------------- |
| GET    | `/api/health`            | liveness                                            |
| GET    | `/api/search?q=&limit=`  | validated typeahead over the AMFI master            |
| POST   | `/api/review`            | single-fund review (sync)                           |
| GET    | `/api/review/stream`     | single-fund review (SSE: `step`* → `result`)        |
| POST   | `/api/portfolio`         | whole-portfolio analysis (sync)                     |
| POST   | `/api/portfolio/stream`  | portfolio (SSE: `start` → `holding`* → `result`)    |

Interactive docs at `/docs`.

---

## 11. Frontend architecture

- App shell (`page.tsx`) with two tabs; each is a self-contained flow with its own phase
  machine (`idle → running → done/error`).
- SSE is parsed manually (`lib/api.ts`) so the UI shows reasoning being *earned*, not a dead
  spinner.
- `FundReview` is one presentational component reused by the single-fund tab and the
  portfolio drill-down (with an added personal-position strip).
- **Explainer/USP system:** every `MetricCard` leads with an always-visible, analogy-driven
  plain line; deeper "what it means / why it matters / how to read it" is one tap away.
- Design system: dark glassmorphism, CSS tokens in `globals.css`, animated health gauge,
  percentile markers, rolling-return range bars, category-mix bar.

---

## 12. Configuration

All env vars are `HPR_`-prefixed (see `backend/.env.example`). The entire deterministic layer
works with **no** credentials. Setting `HPR_ANTHROPIC_API_KEY` enables the Claude narrative;
without it the app falls back to a transparent deterministic summary.

---

## 13. Running, testing

```bash
./dev.sh                                   # both servers (backend :8077, frontend :3000)
cd backend && .venv/bin/python -m pytest -q # quant contract tests
cd frontend && npx tsc --noEmit            # type safety
```

---

## 14. Release history & roadmap

### V1 — shipped
Single-fund honest review, end-to-end: validated search, deterministic metrics (returns,
rolling returns, volatility, Sharpe, Sortino, drawdown), peer-percentile ranking, transparent
health score + Continue/Stop/Shift verdict, evidence ledger with source scores, child-level
explainers, and a polished streaming UI.

### V2 — shipped
Whole-portfolio analysis: add holdings by units + avg buy NAV; per-fund *personal* returns
(gain/loss vs cost); portfolio health + verdict; category mix; category-level concentration
(HHI); best/worst performers; "what to reconsider" action list; two-tab UI with drill-down
from any holding into the full fund review; per-fund streaming.

### Future versions (internal plan — not published)
- **Web-research fan-out** into the appraisal gate: manager changes, expense-ratio drift,
  mandate drift, AUM bloat — each claim reliability-scored before it counts.
- **True stock-level overlap** between funds; benchmark-index comparison.
- **Insights tab** (per-fund and per-portfolio narratives, trends).
- **LangGraph Deep Agents** for deeper autonomous research.
- Broader asset coverage (stocks), statement import, saved portfolios.

Publicly these are represented only as "in progress / loading" — we do not publish the detailed
plan.

---

## 15. Honesty & compliance stance

This is **analytical, educational** output — not personalised investment advice (not SEBI RIA
advice). Verdicts are based on past NAV data; past performance does not guarantee future
results. Qualitative factors not yet incorporated (manager change, mandate drift, expense
ratio) are flagged so a user never acts on a partial picture. Being transparent about limits
makes the product *more* trustworthy, not less — which is the whole point.
