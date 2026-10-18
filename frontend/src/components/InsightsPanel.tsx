"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchFundInsights, fetchPortfolioInsights } from "@/lib/api";
import type { Insight, PortfolioHolding, PortfolioSummary } from "@/lib/types";
import { toneColor } from "@/lib/format";

type Phase = "idle" | "loading" | "done" | "error";

type Props =
  | { mode: "fund"; schemeCode: string }
  | { mode: "portfolio"; summary: PortfolioSummary; holdings: PortfolioHolding[] };

/**
 * The Insights specialist, surfaced in the UI: a "so what?" synthesis over the evidence.
 * On-demand (one click) and cached server-side, so it never silently spends LLM tokens on
 * every view but is instant on repeat views.
 */
export default function InsightsPanel(props: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [llm, setLlm] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    setPhase("loading");
    setErr("");
    try {
      const r =
        props.mode === "fund"
          ? await fetchFundInsights(props.schemeCode)
          : await fetchPortfolioInsights(
              props.summary,
              props.holdings.map((h) => ({
                scheme_name: h.review.scheme_name,
                category: h.review.category,
                weight: h.weight,
                verdict: h.review.verdict,
                return_pct: h.personal.return_pct,
              })),
            );
      setInsights(r.insights);
      setLlm(r.llm_used);
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      setPhase("error");
    }
  }

  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-dim">
            Insights
            {phase === "done" && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] normal-case text-ink-faint">
                {llm ? "AI-synthesised from the evidence" : "Deterministic summary"}
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-ink-faint">
            The &ldquo;so what?&rdquo; — the big picture, real strengths, and honest watch-outs,
            drawn only from the evidence above.
          </p>
        </div>
        {phase !== "done" && (
          <button
            onClick={run}
            disabled={phase === "loading"}
            className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {phase === "loading" ? "Thinking…" : "Generate insights"}
          </button>
        )}
      </div>

      {phase === "error" && (
        <p className="mt-4 text-sm text-negative">Couldn&apos;t generate insights: {err}</p>
      )}

      <AnimatePresence>
        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {insights.map((it, i) => {
              const color = toneColor[it.tone];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border border-line p-4"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    <h3 className="text-sm font-semibold text-ink">{it.title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-dim">{it.detail}</p>
                  <span className="mt-2 inline-block text-[10px] uppercase tracking-wide text-ink-faint">
                    {it.category.replace(/-/g, " ")}
                  </span>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
