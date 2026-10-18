"use client";

import { motion } from "framer-motion";
import type { RollingStat } from "@/lib/types";

/**
 * Rolling returns tell the honest story point-to-point numbers hide: across every
 * historical holding period of N years, what range of annualised outcomes did investors
 * actually get, and how often was it negative?
 */
export default function RollingReturns({ rolling }: { rolling: RollingStat[] }) {
  if (rolling.length === 0) {
    return <p className="text-sm text-ink-faint">Not enough history for rolling-return analysis.</p>;
  }

  // Shared scale across windows for visual comparability.
  const allMin = Math.min(...rolling.map((r) => r.min_cagr), 0);
  const allMax = Math.max(...rolling.map((r) => r.max_cagr));
  const span = allMax - allMin || 1;
  const pos = (v: number) => ((v - allMin) / span) * 100;

  return (
    <div className="space-y-5">
      <p className="text-xs text-ink-faint">
        Range of annualised returns across every rolling holding period in the fund&apos;s
        history — a far more honest read than a single start-to-end number.
      </p>
      {rolling.map((r) => (
        <div key={r.window_years}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-ink-dim">{r.window_years}-year rolling · {r.observations} windows</span>
            <span className="font-mono text-ink-faint">
              {(r.pct_negative * 100).toFixed(0)}% were negative
            </span>
          </div>
          <div className="relative h-9">
            {/* zero line */}
            {allMin < 0 && (
              <div
                className="absolute inset-y-0 w-px bg-black/20"
                style={{ left: `${pos(0)}%` }}
              />
            )}
            {/* min–max range */}
            <motion.div
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
              style={{
                left: `${pos(r.min_cagr)}%`,
                background: "linear-gradient(90deg, var(--negative), var(--neutral), var(--positive))",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${pos(r.max_cagr) - pos(r.min_cagr)}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
            {/* median marker */}
            <div
              className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center"
              style={{ left: `${pos(r.median_cagr)}%` }}
            >
              <div className="h-5 w-0.5 rounded bg-ink" />
            </div>
            {/* labels */}
            <span
              className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-ink-faint"
              style={{ left: `${pos(r.min_cagr)}%` }}
            >
              {(r.min_cagr * 100).toFixed(0)}%
            </span>
            <span
              className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-ink"
              style={{ left: `${pos(r.median_cagr)}%` }}
            >
              {(r.median_cagr * 100).toFixed(0)}%
            </span>
            <span
              className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-ink-faint"
              style={{ left: `${pos(r.max_cagr)}%` }}
            >
              {(r.max_cagr * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      ))}
      <div className="flex gap-4 text-[11px] text-ink-faint">
        <span>min</span>
        <span className="text-ink">│ median</span>
        <span>max</span>
      </div>
    </div>
  );
}
