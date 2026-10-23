"use client";

import type { PersonalHolding, ReviewResponse } from "@/lib/types";
import { formatINR, formatPct } from "@/lib/format";
import VerdictCard from "./VerdictCard";
import MetricCard from "./MetricCard";
import PeerBars from "./PeerBars";
import RollingReturns from "./RollingReturns";
import EvidenceLedger from "./EvidenceLedger";
import ResearchPanel from "./ResearchPanel";
import InsightsPanel from "./InsightsPanel";
import Recommendations from "./Recommendations";
import FundChat from "./FundChat";
import FundHistoryChart from "./FundHistoryChart";
import Markdown from "./Markdown";

export default function FundReview({
  review,
  personal,
  onOpenFund,
}: {
  review: ReviewResponse;
  personal?: PersonalHolding;
  onOpenFund?: (code: string, name: string) => void;
}) {
  const showAlternatives = review.verdict === "Stop" || review.verdict === "Shift";
  // Peer percentile per metric key, so each metric card can show where it sits vs peers.
  const peerPct: Record<string, number> = {};
  for (const r of review.peers?.ranks ?? []) {
    if (r.percentile !== null && r.percentile !== undefined) peerPct[r.key] = r.percentile;
  }
  return (
    <div className="space-y-6">
      <VerdictCard review={review} />

      {personal && <PersonalStrip personal={personal} />}

      <Narrative review={review} />

      <FundHistoryChart schemeCode={review.scheme_code} />

      {showAlternatives && (
        <Recommendations schemeCode={review.scheme_code} onOpenFund={onOpenFund} />
      )}

      <nav className="review-jumpnav" aria-label="Jump to a review section">
        <span>ON THIS PAGE</span>
        <a href="#review-growth">Growth</a>
        <a href="#review-metrics">The numbers</a>
        <a href="#review-peers">Peer comparison</a>
        {showAlternatives && <a href="#review-alternatives">Alternatives</a>}
        <a href="#review-evidence">Evidence</a>
        <a href="#review-research">Deep research</a>
      </nav>

      <InsightsPanel mode="fund" schemeCode={review.scheme_code} />

      <Panel id="review-metrics" title="The numbers — explained like you're new to this" hint="Tap ⓘ for more depth">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {review.metrics.map((m, i) => (
            <MetricCard key={m.key} metric={m} index={i} percentile={peerPct[m.key]} />
          ))}
        </div>
      </Panel>

      <Panel id="review-peers" title="How it stacks up against peers">
        <PeerBars peers={review.peers} />
      </Panel>

      {review.rolling.length > 0 && (
        <Panel id="review-rolling" title="Rolling returns — the honest performance picture">
          <RollingReturns rolling={review.rolling} />
        </Panel>
      )}

      <Panel id="review-evidence" title="Evidence ledger — nothing is taken on faith">
        <EvidenceLedger evidence={review.evidence} />
      </Panel>

      <div id="review-research"><ResearchPanel schemeCode={review.scheme_code} /></div>

      <FundChat review={review} />

      <Caveats caveats={review.caveats} />
    </div>
  );
}

function PersonalStrip({ personal }: { personal: PersonalHolding }) {
  const up = personal.gain >= 0;
  const tone = up ? "var(--positive)" : "var(--negative)";
  const cells = [
    ["You invested", formatINR(personal.invested)],
    ["Worth now", formatINR(personal.current_value)],
    ["Your gain/loss", `${up ? "+" : ""}${formatINR(personal.gain)}`],
    ["Your return", formatPct(personal.return_pct, 1)],
  ] as const;
  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-dim">
        Your position in this fund
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cells.map(([label, val], i) => (
          <div key={i}>
            <div className="text-xs text-ink-faint">{label}</div>
            <div
              className="mt-1 font-mono text-lg font-semibold"
              style={{ color: i >= 2 ? tone : "var(--ink)" }}
            >
              {val}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Based on {personal.units.toLocaleString("en-IN")} units bought at an average NAV of ₹
        {personal.avg_nav.toFixed(2)}; today&apos;s NAV is ₹{personal.current_nav.toFixed(2)}.
      </p>
    </section>
  );
}

function Panel({
  id,
  title,
  hint,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="glass rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">{title}</h2>
        {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Narrative({ review }: { review: ReviewResponse }) {
  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
          The honest take
        </h2>
        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-faint">
          {review.llm_used ? "AI-written, evidence-grounded" : "Deterministic summary"}
        </span>
      </div>
      <Markdown text={review.narrative} />
    </section>
  );
}

function Caveats({ caveats }: { caveats: string[] }) {
  if (caveats.length === 0) return null;
  return (
    <section className="glass rounded-2xl border-caution/20 p-5 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
          The honest limits
        </h2>
        <span className="rounded-full border border-caution/30 bg-caution/5 px-2 py-0.5 text-[10px] font-medium text-caution/90">
          Please read
        </span>
      </div>
      <p className="mb-4 text-xs text-ink-faint">What this analysis can and can&apos;t tell you.</p>
      <ul className="space-y-2.5 text-sm text-ink-dim">
        {caveats.map((c, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-caution/70" />
            {c}
          </li>
        ))}
      </ul>
    </section>
  );
}
