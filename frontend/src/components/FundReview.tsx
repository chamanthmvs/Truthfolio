"use client";

import type { PersonalHolding, ReviewResponse } from "@/lib/types";
import { formatINR, formatPct } from "@/lib/format";
import VerdictCard from "./VerdictCard";
import MetricCard from "./MetricCard";
import PeerBars from "./PeerBars";
import RollingReturns from "./RollingReturns";
import EvidenceLedger from "./EvidenceLedger";
import ResearchPanel from "./ResearchPanel";
import { CitedText } from "./Citations";

export default function FundReview({
  review,
  personal,
}: {
  review: ReviewResponse;
  personal?: PersonalHolding;
}) {
  return (
    <div className="space-y-6">
      <VerdictCard review={review} />

      {personal && <PersonalStrip personal={personal} />}

      <Narrative review={review} />

      <Panel title="The numbers — explained like you're new to this" hint="Tap ⓘ for more depth">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {review.metrics.map((m, i) => (
            <MetricCard key={m.key} metric={m} index={i} />
          ))}
        </div>
      </Panel>

      <Panel title="How it stacks up against peers">
        <PeerBars peers={review.peers} />
      </Panel>

      {review.rolling.length > 0 && (
        <Panel title="Rolling returns — the honest performance picture">
          <RollingReturns rolling={review.rolling} />
        </Panel>
      )}

      <Panel title="Evidence ledger — nothing is taken on faith">
        <EvidenceLedger evidence={review.evidence} />
      </Panel>

      <ResearchPanel schemeCode={review.scheme_code} />

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
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">{title}</h2>
        {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Narrative({ review }: { review: ReviewResponse }) {
  const paras = review.narrative.split("\n").filter((l) => l.trim().length > 0);
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
      <div className="space-y-2 text-sm leading-relaxed text-ink-dim">
        {paras.map((p, i) => {
          const bullet = p.trim().startsWith("•");
          return (
            <p key={i} className={bullet ? "pl-4 text-ink" : i === 0 ? "font-medium text-ink" : ""}>
              <CitedText text={p} />
            </p>
          );
        })}
      </div>
    </section>
  );
}

function Caveats({ caveats }: { caveats: string[] }) {
  if (caveats.length === 0) return null;
  return (
    <section className="glass rounded-2xl border-caution/20 p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-caution/90">
        Read this before acting
      </h2>
      <ul className="space-y-2 text-sm text-ink-dim">
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
