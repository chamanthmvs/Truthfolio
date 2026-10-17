"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MetricOut } from "@/lib/types";
import { formatMetric, toneColor } from "@/lib/format";

export default function MetricCard({ metric, index }: { metric: MetricOut; index: number }) {
  const [open, setOpen] = useState(false);
  const tone = metric.interpretation?.tone ?? "neutral";
  const color = toneColor[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="glass group flex flex-col rounded-xl p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-snug text-ink-dim">{metric.label}</span>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Explain this metric"
          className="shrink-0 rounded-full border border-line p-1 text-ink-faint transition hover:border-line hover:text-ink"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="7.5" r="1.1" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold text-ink">
          {formatMetric(metric)}
        </span>
      </div>

      {metric.interpretation && (
        <span
          className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{ background: `${color}1c`, color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {metric.interpretation.label}
        </span>
      )}

      {/* Child-level plain explanation — the USP. Always visible, never hidden. */}
      {metric.plain && (
        <p className="mt-3 text-xs leading-relaxed text-ink-dim">{metric.plain}</p>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs leading-relaxed">
              <Explain label="In short" text={metric.meaning} />
              <Explain label="Why it matters" text={metric.why_it_matters} />
              <Explain label="How to read it" text={metric.how_to_read} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Explain({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <p className="text-ink-dim">
      <span className="font-semibold text-ink">{label}: </span>
      {text}
    </p>
  );
}
