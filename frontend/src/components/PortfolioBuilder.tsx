"use client";

import { motion, AnimatePresence } from "framer-motion";
import SearchBar from "./SearchBar";
import type { DraftHolding, SchemeHit } from "@/lib/types";
import { formatINR } from "@/lib/format";

interface Props {
  drafts: DraftHolding[];
  setDrafts: (d: DraftHolding[]) => void;
  onAnalyze: () => void;
}

export default function PortfolioBuilder({ drafts, setDrafts, onAnalyze }: Props) {
  function add(scheme: SchemeHit) {
    if (drafts.some((d) => d.scheme.code === scheme.code)) return;
    setDrafts([...drafts, { scheme, units: 0, avg_nav: 0 }]);
  }
  function update(code: string, patch: Partial<DraftHolding>) {
    setDrafts(drafts.map((d) => (d.scheme.code === code ? { ...d, ...patch } : d)));
  }
  function remove(code: string) {
    setDrafts(drafts.filter((d) => d.scheme.code !== code));
  }

  const ready = drafts.length > 0 && drafts.every((d) => d.units > 0 && d.avg_nav > 0);
  const totalInvested = drafts.reduce((s, d) => s + d.units * d.avg_nav, 0);

  return (
    <div className="space-y-5">
      <SearchBar onSelect={add} />

      <AnimatePresence>
        {drafts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass rounded-2xl p-4 sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
                Your holdings ({drafts.length})
              </h3>
              {totalInvested > 0 && (
                <span className="text-xs text-ink-faint">
                  invested so far: {formatINR(totalInvested)}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {drafts.map((d) => (
                <div
                  key={d.scheme.code}
                  className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{d.scheme.name}</div>
                    <div className="text-xs text-ink-faint">
                      {d.scheme.category} · {d.scheme.amc}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <NumberField
                      label="Units"
                      value={d.units}
                      onChange={(v) => update(d.scheme.code, { units: v })}
                    />
                    <NumberField
                      label="Avg buy NAV ₹"
                      value={d.avg_nav}
                      onChange={(v) => update(d.scheme.code, { avg_nav: v })}
                    />
                    <div className="hidden w-24 shrink-0 text-right sm:block">
                      <div className="text-[10px] text-ink-faint">invested</div>
                      <div className="font-mono text-xs text-ink-dim">
                        {d.units > 0 && d.avg_nav > 0 ? formatINR(d.units * d.avg_nav) : "—"}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(d.scheme.code)}
                      aria-label="Remove"
                      className="shrink-0 rounded-lg border border-line p-2 text-ink-faint transition hover:border-negative/40 hover:text-negative"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              disabled={!ready}
              onClick={onAnalyze}
              className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-sm transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-ink-faint"
            >
              {ready
                ? "Analyze my portfolio →"
                : "Enter units and avg buy NAV for every fund"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {drafts.length === 0 && (
        <p className="text-center text-sm text-ink-faint">
          Search and add each fund you hold, then enter how many units you own and the average
          NAV you bought at.
        </p>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-0.5 text-[10px] text-ink-faint">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        className="w-24 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}
