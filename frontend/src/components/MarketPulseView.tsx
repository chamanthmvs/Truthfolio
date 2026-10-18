"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchMarketPulse, type MarketPulseResponse } from "@/lib/api";
import { toneColor } from "@/lib/format";
import { CitedText, SourcesList } from "./Citations";

type Phase = "idle" | "loading" | "done" | "error";

const SECTION_META: Record<string, { label: string; icon: string }> = {
  triggers: { label: "What's moving the market", icon: "⚡" },
  highlights: { label: "Bright spots", icon: "📈" },
  watchouts: { label: "Risks to watch", icon: "⚠️" },
  outlook: { label: "What analysts expect", icon: "🔭" },
};

/**
 * Market Pulse: an honest, cited read on the broader market. On-demand + cached, so opening
 * the tab doesn't silently spend search credits. Projections are shown as attributed opinions,
 * never as the app's own forecast.
 */
export default function MarketPulseView() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [data, setData] = useState<MarketPulseResponse | null>(null);
  const [err, setErr] = useState("");

  async function run() {
    setPhase("loading");
    setErr("");
    try {
      const r = await fetchMarketPulse();
      setData(r);
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      setPhase("error");
    }
  }

  const pulse = data?.pulse ?? null;
  const moodColor = pulse ? toneColor[pulse.mood.tone] : "var(--brand)";

  return (
    <div className="space-y-6">
      {phase === "idle" && (
        <div className="text-center">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-[16ch] text-4xl font-extrabold leading-[1.04] tracking-[-0.03em] text-ink sm:text-6xl"
          >
            Today&apos;s market, honestly.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-[46ch] text-lg leading-relaxed text-ink-dim"
          >
            A plain-English read on the mood, what&apos;s driving it, the risks, and what
            analysts expect — every point backed by a cited source.
          </motion.p>
          <button
            onClick={run}
            className="mt-8 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            Get today&apos;s market pulse
          </button>
          <p className="mt-3 text-[11px] text-ink-faint">
            Loads on demand and is cached — uses a small amount of web-search credit.
          </p>
        </div>
      )}

      {phase === "loading" && (
        <div className="glass-strong flex items-center gap-3 rounded-2xl p-6 text-sm text-ink-dim">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-brand" />
          Reading the market and checking source reliability…
        </div>
      )}

      {phase === "error" && (
        <div className="glass rounded-2xl border-negative/30 p-6 text-sm text-negative">
          Couldn&apos;t load the market pulse: {err}
        </div>
      )}

      {phase === "done" && data && !data.enabled && (
        <div className="glass rounded-2xl p-6 text-sm text-ink-dim">
          {data.reason ?? "Market Pulse isn't configured."}
        </div>
      )}

      {phase === "done" && data?.enabled && !pulse && (
        <div className="glass rounded-2xl p-6 text-sm text-ink-dim">
          {data.message ?? "No reliable market sources available right now."}
        </div>
      )}

      <AnimatePresence>
        {phase === "done" && pulse && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Mood hero */}
            <section className="glass-strong relative overflow-hidden rounded-2xl p-6 sm:p-8">
              <div
                className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full opacity-[0.08] blur-3xl"
                style={{ background: moodColor }}
              />
              <div className="text-xs uppercase tracking-widest text-ink-faint">Market mood</div>
              <div
                className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-lg font-semibold"
                style={{ background: `${moodColor}1f`, color: moodColor, border: `1px solid ${moodColor}44` }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: moodColor, boxShadow: `0 0 10px ${moodColor}` }} />
                {pulse.mood.label}
              </div>
              <p className="mt-4 max-w-2xl text-base text-ink">
                <CitedText text={pulse.mood.summary} />
              </p>
            </section>

            {/* Sections */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {pulse.sections.map((sec) => {
                const meta = SECTION_META[sec.kind] ?? { label: sec.title, icon: "•" };
                return (
                  <section key={sec.kind} className="glass rounded-2xl p-5 sm:p-6">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-dim">
                      <span aria-hidden>{meta.icon}</span> {sec.title || meta.label}
                    </h2>
                    <ul className="space-y-2.5">
                      {sec.items.map((it, i) => {
                        const c = toneColor[it.tone];
                        return (
                          <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-dim">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
                            <span><CitedText text={it.text} /></span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>

            <SourcesList footnotes={data?.footnotes ?? []} />

            <section className="glass rounded-2xl border-caution/20 p-5 sm:p-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-caution/90">
                How to read this
              </h2>
              <p className="text-sm leading-relaxed text-ink-dim">
                This is a snapshot of what reliable sources are reporting — not a prediction or a
                recommendation. Any outlook is the view of the <em>named source</em>, not
                Truthfolio&apos;s, and markets can move against any forecast. Educational only.
              </p>
            </section>

            {data?.budget && (
              <p className="text-center text-[11px] text-ink-faint">
                Web searches used today: {data.budget.used_today} / {data.budget.daily_cap}.
              </p>
            )}

            <div className="text-center">
              <button
                onClick={run}
                className="rounded-full border border-line px-4 py-1.5 text-xs text-ink-dim transition hover:text-ink"
              >
                Refresh
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
