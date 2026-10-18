"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchResearch, type ResearchResponse } from "@/lib/api";
import { toneColor } from "@/lib/format";
import { CitedText, SourcesList } from "./Citations";

type Phase = "idle" | "loading" | "done" | "error";

const DIR_LABEL: Record<string, string> = {
  positive: "Supports",
  negative: "Concern",
  neutral: "Context",
};

/**
 * Explicit, credit-aware web research for a single fund. Nothing here runs until the user
 * clicks — the standard review spends zero search credits. Shows cited findings + sources,
 * and surfaces the remaining daily search budget.
 */
export default function ResearchPanel({ schemeCode }: { schemeCode: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [data, setData] = useState<ResearchResponse | null>(null);
  const [err, setErr] = useState("");

  async function run() {
    setPhase("loading");
    setErr("");
    try {
      const r = await fetchResearch(schemeCode);
      setData(r);
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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
            Deep web research
          </h2>
          <p className="mt-1 text-xs text-ink-faint">
            Searches the web for what numbers can&apos;t show — manager, cost, mandate drift,
            fund size, regulatory signals — each finding cited and reliability-checked.
          </p>
        </div>
        {phase !== "done" && (
          <button
            onClick={run}
            disabled={phase === "loading"}
            className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {phase === "loading" ? "Researching…" : "Run deep research"}
          </button>
        )}
      </div>

      {phase === "idle" && (
        <p className="mt-3 text-[11px] text-ink-faint">
          Runs only when you click. Uses a small amount of web-search credit.
        </p>
      )}

      {phase === "loading" && (
        <div className="mt-4 flex items-center gap-3 text-sm text-ink-dim">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-brand" />
          Searching the web and checking source reliability…
        </div>
      )}

      {phase === "error" && (
        <p className="mt-4 text-sm text-negative">Couldn&apos;t complete research: {err}</p>
      )}

      <AnimatePresence>
        {phase === "done" && data && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 space-y-4"
          >
            {!data.enabled ? (
              <p className="rounded-xl border border-caution/25 bg-caution/5 p-4 text-sm text-ink-dim">
                {data.reason ?? "Web research isn't configured."}
              </p>
            ) : data.evidence.length === 0 ? (
              <p className="text-sm text-ink-faint">
                No notable web findings surfaced from reliable sources.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {data.evidence.map((e, i) => {
                  const color = toneColor[e.direction];
                  return (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-line p-3">
                      <span
                        className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: `${color}1c`, color }}
                      >
                        {DIR_LABEL[e.direction] ?? "Context"}
                      </span>
                      <span className="flex-1 text-sm leading-snug text-ink">
                        <CitedText text={e.claim} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {data.enabled && <SourcesList footnotes={data.footnotes} />}

            {data.budget && (
              <p className="text-[11px] text-ink-faint">
                Web searches used today: {data.budget.used_today} / {data.budget.daily_cap}.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
