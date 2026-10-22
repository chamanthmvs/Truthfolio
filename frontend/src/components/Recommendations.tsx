"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fetchRecommendations } from "@/lib/api";
import type { Alternative, RecommendationComparison, RecommendationsResponse } from "@/lib/types";

interface Props {
  schemeCode: string;
  /** Open a different fund's full review (an alternative the user wants to examine). */
  onOpenFund?: (code: string, name: string) => void;
}

function fmt(value: number | null, unit: string): string {
  if (value === null || value === undefined) return "—";
  if (unit === "%") return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(2);
}

export default function Recommendations({ schemeCode, onOpenFund }: Props) {
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    setData(null);
    fetchRecommendations(schemeCode)
      .then((r) => {
        if (!active) return;
        setData(r);
        setState("done");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [schemeCode]);

  if (state === "error") return null; // never block the review on this optional panel

  return (
    <section id="review-alternatives" className="glass rounded-2xl p-5 sm:p-6">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
            <path
              d="M4 17l5-5 4 4 7-7M20 5h-4m4 0v4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
          Stronger alternatives to research
        </h2>
      </div>

      {state === "loading" && (
        <p className="text-sm text-ink-faint">
          Scoring same-category funds on the same four core metrics…
        </p>
      )}

      {state === "done" && data && (
        <>
          <p className="max-w-3xl text-xs leading-relaxed text-ink-faint">{data.basis}</p>

          {data.alternatives.length === 0 ? (
            <p className="mt-4 rounded-xl border border-line bg-white/60 px-4 py-3 text-sm text-ink-dim">
              {data.empty_reason ??
                "No same-category fund in our sample scores clearly higher on these metrics."}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {data.alternatives.map((alt, i) => (
                <AlternativeCard key={alt.scheme_code} alt={alt} index={i} onOpen={onOpenFund} />
              ))}
            </div>
          )}

          {data.disclaimer && (
            <div className="mt-5 flex gap-2.5 rounded-xl border border-caution/25 bg-caution/[0.06] px-4 py-3 text-xs leading-relaxed text-ink-dim">
              <span className="mt-0.5 shrink-0 text-caution" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
                  <path
                    d="M12 8v5m0 3.5h.01M12 3l9 16H3l9-16z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>{data.disclaimer}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AlternativeCard({
  alt,
  index,
  onOpen,
}: {
  alt: Alternative;
  index: number;
  onOpen?: (code: string, name: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className="rounded-2xl border border-line bg-white/70 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug text-ink">{alt.scheme_name}</h3>
          <p className="mt-0.5 text-xs text-ink-faint">{alt.amc}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-semibold text-positive">
            {alt.strength_score.toFixed(0)}
            <span className="text-xs font-normal text-ink-faint">/100</span>
          </div>
          <div className="text-[11px] text-ink-faint">
            strength score
            {alt.strength_edge !== null && (
              <span className="ml-1 text-positive">(+{alt.strength_edge.toFixed(0)})</span>
            )}
          </div>
        </div>
      </div>

      {alt.headline && (
        <p className="mt-2 text-sm font-medium leading-snug text-ink">{alt.headline}</p>
      )}

      {alt.reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {alt.reasons.map((reason, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-dim">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-positive/70" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      <ComparisonTable rows={alt.comparison} />

      {onOpen && (
        <div className="mt-4">
          <button
            onClick={() => onOpen(alt.scheme_code, alt.scheme_name)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            See its full review
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
              <path
                d="M3.5 10h12m-5-5 5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </motion.div>
  );
}

function ComparisonTable({ rows }: { rows: RecommendationComparison[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-line">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-black/[0.03] text-ink-faint">
            <th className="px-3 py-2 text-left font-medium">Metric</th>
            <th className="px-3 py-2 text-right font-medium">This fund</th>
            <th className="px-3 py-2 text-right font-medium">Alternative</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="px-3 py-2 text-ink-dim">{r.label}</td>
              <td className="px-3 py-2 text-right font-mono text-ink-faint">
                {fmt(r.subject_value, r.unit)}
              </td>
              <td
                className={`px-3 py-2 text-right font-mono ${
                  r.better ? "font-semibold text-positive" : "text-ink-dim"
                }`}
              >
                {fmt(r.alt_value, r.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
