"use client";

import { motion } from "framer-motion";
import type { PortfolioSummary, Tone } from "@/lib/types";
import { formatINR, formatPct, toneColor } from "@/lib/format";
import HealthGauge from "./HealthGauge";
import QuickRead from "./QuickRead";
import { buildPortfolioQuickRead } from "@/lib/quickread";

function verdictTone(v: string): Tone {
  if (v === "Healthy") return "positive";
  if (v === "Needs rebalancing") return "negative";
  return "caution";
}

export default function PortfolioOverview({ summary }: { summary: PortfolioSummary }) {
  const tone = verdictTone(summary.verdict);
  const color = toneColor[tone];
  const up = summary.total_gain >= 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong relative overflow-hidden rounded-2xl p-6 sm:p-8"
      >
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
          style={{ background: color }}
        />
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-widest text-ink-faint">
              Portfolio verdict
            </div>
            <div
              className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-lg font-semibold"
              style={{ background: `${color}1f`, color, border: `1px solid ${color}44` }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
              {summary.verdict}
            </div>
            <p className="mt-4 max-w-xl text-base text-ink">{summary.headline}</p>
            <div className="mt-4">
              <QuickRead data={buildPortfolioQuickRead(summary)} />
            </div>
          </div>
          <div className="flex shrink-0 justify-center sm:justify-end">
            <HealthGauge score={summary.health_score} tone={tone} />
          </div>
        </div>
      </motion.section>

      {/* Money row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="You invested" value={formatINR(summary.total_invested)} />
        <Stat label="Worth today" value={formatINR(summary.total_current)} />
        <Stat
          label="Total gain/loss"
          value={`${up ? "+" : ""}${formatINR(summary.total_gain)}`}
          color={up ? "var(--positive)" : "var(--negative)"}
        />
        <Stat
          label="Overall return"
          value={formatPct(summary.overall_return_pct, 1)}
          color={up ? "var(--positive)" : "var(--negative)"}
        />
      </div>

      {/* Mix + concentration */}
      <section className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-dim">
          Where your money sits
        </h2>
        <CategoryMix summary={summary} />
        <div className="mt-5 rounded-xl border border-line p-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-ink">Diversification:</span>
            <span className="text-ink-dim">{summary.diversification}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-faint">
            <span>
              Biggest single fund: <span className="text-ink-dim">{formatPct(summary.top_holding_pct, 0).replace("+", "")}</span>
            </span>
            <span>
              Biggest category: <span className="text-ink-dim">{summary.top_category} ({formatPct(summary.top_category_pct, 0).replace("+", "")})</span>
            </span>
          </div>
        </div>
      </section>

      {/* Best / worst */}
      {(summary.best_performer || summary.worst_performer) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {summary.best_performer && (
            <Performer kind="best" p={summary.best_performer} />
          )}
          {summary.worst_performer && (
            <Performer kind="worst" p={summary.worst_performer} />
          )}
        </div>
      )}

      {/* Actions */}
      {summary.action_items.length > 0 && (
        <section className="glass rounded-2xl p-5 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-dim">
            What to reconsider
          </h2>
          <ul className="space-y-2 text-sm text-ink-dim">
            {summary.action_items.map((a, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-caution" />
                {a}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Caveats */}
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
          {summary.caveats.map((c, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-caution/70" />
              {c}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// Editorial-light categorical palette — saturated enough to read on a white track.
const MIX_COLORS = ["#0e7c5a", "#2563eb", "#b45309", "#d52c3a", "#7c3aed", "#0891b2", "#be185d"];

function CategoryMix({ summary }: { summary: PortfolioSummary }) {
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-black/[0.06]">
        {summary.category_mix.map((c, i) => (
          <motion.div
            key={c.category}
            initial={{ width: 0 }}
            animate={{ width: `${c.pct * 100}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
            style={{ background: MIX_COLORS[i % MIX_COLORS.length] }}
            title={`${c.category}: ${(c.pct * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {summary.category_mix.map((c, i) => (
          <div key={c.category} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: MIX_COLORS[i % MIX_COLORS.length] }}
            />
            <span className="text-ink-dim">{c.category}</span>
            <span className="font-mono text-ink-faint">{(c.pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold" style={{ color: color ?? "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

function Performer({ kind, p }: { kind: "best" | "worst"; p: { scheme_name: string; return_pct: number; gain: number } }) {
  const isBest = kind === "best";
  const color = isBest ? "var(--positive)" : "var(--negative)";
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-ink-faint">
        {isBest ? "Carrying the portfolio" : "Lagging most"}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-ink">{p.scheme_name}</div>
      <div className="mt-1 font-mono text-sm" style={{ color }}>
        {formatPct(p.return_pct, 1)} · {p.gain >= 0 ? "+" : ""}{formatINR(p.gain)}
      </div>
    </div>
  );
}
