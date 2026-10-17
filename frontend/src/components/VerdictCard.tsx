"use client";

import { motion } from "framer-motion";
import type { ReviewResponse } from "@/lib/types";
import { toneColor, verdictTone } from "@/lib/format";
import HealthGauge from "./HealthGauge";

const VERDICT_COPY: Record<string, string> = {
  Continue: "Stay invested — it holds up to scrutiny.",
  Shift: "Consider shifting — better peers exist.",
  Stop: "Reconsider — weak on a risk-adjusted basis.",
  Inconclusive: "Not enough evidence for a confident call.",
};

export default function VerdictCard({ review }: { review: ReviewResponse }) {
  const tone = verdictTone(review.verdict);
  const color = toneColor[tone];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-strong relative overflow-hidden rounded-2xl p-6 sm:p-8"
    >
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: color }}
      />
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2 text-xs text-ink-faint">
            <span className="rounded-full border border-line px-2.5 py-1">
              {review.category}
            </span>
            {review.as_of && <span>as of {review.as_of}</span>}
          </div>
          <h1 className="text-2xl font-semibold leading-tight text-ink sm:text-3xl">
            {review.scheme_name}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-lg font-semibold"
              style={{ background: `${color}1f`, color, border: `1px solid ${color}44` }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: color, boxShadow: `0 0 10px ${color}` }}
              />
              {review.verdict}
            </div>
            <span className="text-sm text-ink-dim">{VERDICT_COPY[review.verdict]}</span>
          </div>

          <div className="mt-5 max-w-xl">
            <ConfidenceBar value={review.confidence} />
          </div>
        </div>

        <div className="flex shrink-0 justify-center sm:justify-end">
          <HealthGauge score={review.health_score} tone={tone} />
        </div>
      </div>
    </motion.section>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-ink-faint">Confidence in this verdict</span>
        <span className="font-mono text-ink-dim">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-brand"
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
