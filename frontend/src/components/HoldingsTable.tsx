"use client";

import { motion } from "framer-motion";
import type { PortfolioHolding, Verdict } from "@/lib/types";
import { formatINR, formatPct, toneColor, verdictTone } from "@/lib/format";

export default function HoldingsTable({
  holdings,
  onOpen,
}: {
  holdings: PortfolioHolding[];
  onOpen: (h: PortfolioHolding) => void;
}) {
  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
          Your funds, fund by fund
        </h2>
        <span className="text-[11px] text-ink-faint">tap a fund for the full honest review</span>
      </div>

      <div className="space-y-2">
        {sorted.map((h, i) => {
          const tone = verdictTone(h.review.verdict as Verdict);
          const color = toneColor[tone];
          const up = h.personal.gain >= 0;
          return (
            <motion.button
              key={h.review.scheme_code}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onOpen(h)}
              className="group flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left transition hover:border-brand/30 hover:bg-brand/[0.04]"
            >
              {/* name + category */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{h.review.scheme_name}</div>
                <div className="text-xs text-ink-faint">{h.review.category}</div>
              </div>

              {/* weight */}
              <div className="hidden w-16 shrink-0 text-right sm:block">
                <div className="text-[10px] text-ink-faint">weight</div>
                <div className="font-mono text-xs text-ink-dim">{(h.weight * 100).toFixed(0)}%</div>
              </div>

              {/* your return */}
              <div className="w-20 shrink-0 text-right">
                <div className="text-[10px] text-ink-faint">your return</div>
                <div className="font-mono text-xs" style={{ color: up ? "var(--positive)" : "var(--negative)" }}>
                  {formatPct(h.personal.return_pct, 1)}
                </div>
                <div className="font-mono text-[10px] text-ink-faint">
                  {up ? "+" : ""}{formatINR(h.personal.gain)}
                </div>
              </div>

              {/* verdict */}
              <div className="w-20 shrink-0 text-right">
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: `${color}1c`, color }}
                >
                  {h.review.verdict}
                </span>
                <div className="mt-0.5 font-mono text-[10px] text-ink-faint">H{Math.round(h.review.health_score)}</div>
              </div>

              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                className="shrink-0 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-ink"
              >
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
