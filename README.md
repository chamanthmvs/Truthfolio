<div align="center">

# ⚖️ Honest Portfolio Reviewer

### Should you keep that fund, drop it, or switch to something better?

**Get the honest answer — not a sales pitch.**
Every verdict is computed from real market data, measured against similar funds, and explained
so plainly that anyone can follow the *why* — not just finance pros.

**`Continue`  ·  `Stop`  ·  `Shift`**

</div>

---

## What is this?

If you've put money into mutual funds, you've probably asked yourself: *"Is this actually a
good fund, or am I just hoping?"*

**Honest Portfolio Reviewer answers that question — honestly.** You give it a fund (or your
whole portfolio), and it tells you plainly whether to **keep it, drop it, or switch to
something better** — and then it *shows you exactly why*, using numbers computed from real
market data, compared against similar funds, with every term explained like you're brand new
to investing.

No sales pitch. No jargon dumped on you. No vibes. Just the truth, with the receipts.

---

## Why it's different

Most tools either flatter every fund or bury you in numbers you can't read. This one is built
on three promises:

| Promise | What it means for you |
| --- | --- |
| 🫡 **Full honesty** | If a fund is weak, we say so — even if it made you money. A fund that's up can still be a bad place for your money if better options exist. |
| 🧾 **Evidence-based** | Every single claim traces back to a real, computed number. Nothing is made up. You can expand any verdict down to its sources and see how much we trust each one. |
| 🧒 **Explained like you're new** | Every metric comes with a plain-English, everyday-analogy explanation. "Was the bumpy ride worth it?" instead of "risk-adjusted return." |

---

## What you can do

### 🔍 Review a single fund
Search any Indian mutual fund (only real, registered schemes appear — no typos, no fakes),
and get:
- A clear **Continue / Stop / Shift** verdict with a **health score** and a confidence level
- **Returns, risk, and consistency** metrics — each with a one-line plain explanation
- **How it ranks against similar funds** (are you in a top fund or a laggard?)
- **Rolling returns** — the honest performance picture, not one lucky number
- An **evidence ledger** you can open up to see the proof behind every point

### 📊 Review your whole portfolio
Add the funds you own with your units and average buy price, and get:
- Your **total invested vs. worth today**, and your real gain/loss in ₹ and %
- An overall **portfolio health score and verdict**
- **Where your money actually sits** — the mix across fund types, and whether you're
  dangerously concentrated
- Your **best and worst performers**, and a clear **"what to reconsider"** list
- Tap any fund to open its full honest review

---

## How it works (the short version)

```
Your fund / portfolio
        │
        ▼
  Pull real NAV history  ──►  Compute the numbers (returns, risk, consistency)
        │                           │
        ▼                           ▼
  Rank against peers   ──►   Weigh the evidence   ──►   Honest verdict + plain-English why
```

Under the hood: a **Python + FastAPI** backend runs a **LangGraph** reasoning pipeline over
free, public market data (AMFI + mfapi), with a transparent scoring engine deciding the
verdict. A **Next.js** frontend streams the reasoning live so you watch the verdict being
*earned*, not guessed. There's an optional AI narrative layer that writes the human summary —
but it can only explain the evidence, never invent it or overrule the score.

---

## Versions

### ✅ V1 — Single-fund review
Validated fund search, full metrics with plain-English explanations, peer ranking, rolling
returns, a transparent health score and Continue/Stop/Shift verdict, and an inspectable
evidence ledger.

### ✅ V2 — Whole-portfolio review
Add your holdings (units + average buy NAV), see your personal returns per fund, a
portfolio-level health score and verdict, your category mix and concentration, best/worst
performers, and a "what to reconsider" list — with drill-down into any fund's full review.

### 🚧 Future versions
> **In progress… loading ▰▰▰▱▱▱▱**
>
> More is being built. Stay tuned. 🙂

---

## Quickstart

```bash
./dev.sh
```

Then open **http://localhost:3000**.

Or run the two apps separately:

```bash
# Backend  → http://localhost:8077  (API docs at /docs)
cd backend && uv venv .venv && uv pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload --port 8077

# Frontend → http://localhost:3000
cd frontend && npm install && npm run dev
```

The entire core — search, metrics, peer ranking, verdicts — runs with **zero API keys** on
free public data. (An optional AI narrative can be enabled via `backend/.env`.)

**Tech:** Python · FastAPI · LangGraph · Next.js · TypeScript · Tailwind.
Engineering details live in [`docs/TECHNICAL.md`](docs/TECHNICAL.md).

---

## A note on trust

This is **educational analysis, not personalised investment advice.** Verdicts are based on
past performance, which never guarantees future results. We're transparent about what we
don't yet factor in — because being honest about our limits is the entire point of this
project.

---

<div align="center">
<sub>Built for investors who'd rather hear the truth.</sub>
</div>
