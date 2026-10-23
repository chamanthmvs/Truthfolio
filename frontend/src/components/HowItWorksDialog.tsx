"use client";

import { useRef } from "react";

const FUND_COMPONENTS = [
  {
    name: "Peer standing",
    weight: "30%",
    detail: "Average percentile for 3-year return, 5-year return, and Sharpe ratio among comparable funds.",
  },
  {
    name: "Risk-adjusted returns",
    weight: "26%",
    detail: "Sharpe and Sortino ratios indicate how returns compare with overall and downside volatility.",
  },
  {
    name: "Long-term returns",
    weight: "22%",
    detail: "Uses 5-year annualised return when available, otherwise 3-year return.",
  },
  {
    name: "Return consistency",
    weight: "14%",
    detail: "Looks at how often historical rolling returns were negative, preferring the 5-year window.",
  },
  {
    name: "Largest decline",
    weight: "8%",
    detail: "Considers the fund's worst peak-to-trough fall in the available NAV history.",
  },
];

export default function HowItWorksDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="app-guide-link"
        aria-haspopup="dialog"
      >
        How it works
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8.2 7.7a1.9 1.9 0 1 1 3.2 1.4c-.9.8-1.4 1-1.4 2.1m0 2.1h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="scoring-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto max-h-[88dvh] w-[min(94vw,48rem)] max-w-none overflow-hidden rounded-2xl border border-line bg-bg-elev p-0 text-ink shadow-[var(--shadow-lg)] backdrop:bg-black/40"
      >
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-positive">
                Clear rules. Inspectable evidence.
              </p>
              <h2 id="scoring-dialog-title" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                How Truthfolio scores funds
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">
                The score and verdict come from published NAV data and fixed rules—not an AI
                opinion. AI may help explain the result, but it does not choose the score or verdict.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-lg text-ink-dim transition hover:bg-bg-subtle hover:text-ink"
              aria-label="Close scoring explanation"
              autoFocus
            >
              ×
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <section aria-labelledby="plain-heading">
              <h3 id="plain-heading" className="text-sm font-semibold text-ink">In plain words</h3>
              <ol className="mt-3 space-y-2.5">
                {[
                  "You pick a fund (or add your portfolio).",
                  "We pull its real price history (NAV) from official public data — the actual past, not estimates.",
                  "We work out the returns, risk and consistency, and rank it against similar funds.",
                  "A fixed scoring formula turns that into an honest verdict — Continue, Stop, or Shift — with every number explained.",
                ].map((text, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-dim">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-soft font-mono text-[11px] font-semibold text-brand">
                      {i + 1}
                    </span>
                    {text}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                No vibes, no sales pitch — the verdict is arithmetic you can inspect. Here&apos;s
                exactly how it&apos;s built, so you can check it yourself.
              </p>
            </section>

            <section className="mt-7" aria-labelledby="fund-score-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="fund-score-heading" className="text-sm font-semibold text-ink">
                  Fund health score
                </h3>
                <span className="text-xs text-ink-faint">0–100 · higher means stronger signals in this model</span>
              </div>
              <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
                {FUND_COMPONENTS.map((component) => (
                  <div key={component.name} className="grid grid-cols-[minmax(0,1fr)_3.25rem] gap-x-3 gap-y-1 bg-white/70 px-4 py-3 sm:grid-cols-[9.5rem_3.5rem_minmax(0,1fr)] sm:items-start">
                    <span className="text-xs font-semibold text-ink">{component.name}</span>
                    <span className="text-xs font-semibold tabular-nums text-brand">{component.weight}</span>
                    <p className="col-span-2 text-xs leading-relaxed text-ink-dim sm:col-span-1">
                      {component.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                If a component cannot be calculated from available history, it is left out and
                the remaining component weights are rescaled. Peer comparisons use a limited
                same-category sample, not every fund in the market.
              </p>
            </section>

            <section className="mt-6" aria-labelledby="verdict-heading">
              <h3 id="verdict-heading" className="text-sm font-semibold text-ink">
                How the verdict is chosen
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <VerdictCard title="Continue" detail="Generally a stronger score, with no clear underperformance signal against available peers." />
                <VerdictCard title="Shift" detail="Signals are weaker or the fund ranks poorly against its same-category peers." />
                <VerdictCard title="Stop" detail="The score is low on an absolute basis; this is not simply a poor peer rank." />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                The exact rule order and thresholds are shown below for transparency. They are
                model heuristics—not regulated ratings or personal instructions.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-dim">
                <li>Continue when the score is at least 62 and peer standing is at least the 45th percentile, or unavailable.</li>
                <li>Otherwise Stop when the score is below 42.</li>
                <li>Otherwise Shift when available peer standing is below the 45th percentile.</li>
                <li>In remaining cases, Continue at 55 or above; otherwise Shift.</li>
              </ul>
            </section>

            <section className="mt-6 rounded-xl border border-line bg-bg-subtle/70 p-4" aria-labelledby="portfolio-score-heading">
              <h3 id="portfolio-score-heading" className="text-sm font-semibold text-ink">
                Portfolio health is calculated separately
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-dim">
                It blends each analyzed fund&apos;s health score by its current portfolio weight,
                then subtracts a concentration penalty of up to 12 points based on fund count,
                holding concentration, and category concentration. The result is Healthy at 65+
                with a penalty of 5 or less, Minor tweaks at 50+, and Needs rebalancing below 50.
              </p>
            </section>

            <section className="mt-6 rounded-xl border border-line bg-bg-subtle/70 p-4" aria-labelledby="data-heading">
              <h3 id="data-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
                <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
                  <rect x="4" y="8.5" width="12" height="8" rx="1.75" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6.75 8.5V6.5a3.25 3.25 0 0 1 6.5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Your data — we keep nothing
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                No accounts, no database. The funds you enter and any statement you upload are used
                to produce your analysis and then discarded — close the tab and nothing remains. A
                CAS statement is read in memory only; the file and its password are never written to
                disk, logged, or stored. If you turn on the AI features, your question and the
                on-screen analysis go to the AI provider to answer it — we don&apos;t save them.
              </p>
            </section>

            <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-ink-faint">
              Scores summarize historical NAV behavior and the data available at review time.
              They do not predict future performance or account for your goals, risk capacity,
              taxes, or complete financial situation. Educational only—not personalized investment advice.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}

function VerdictCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/70 p-3">
      <h4 className="text-xs font-semibold text-ink">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-ink-dim">{detail}</p>
    </div>
  );
}
