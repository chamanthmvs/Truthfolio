"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SearchBar from "./SearchBar";
import { CAS_MAX_BYTES, importStatement } from "@/lib/api";
import type { DraftHolding, ImportResult, SchemeHit } from "@/lib/types";
import { formatINR } from "@/lib/format";

interface Props {
  drafts: DraftHolding[];
  setDrafts: (d: DraftHolding[]) => void;
  onAnalyze: () => void;
}

export default function PortfolioBuilder({ drafts, setDrafts, onAnalyze }: Props) {
  const [builderNotice, setBuilderNotice] = useState("");

  function add(scheme: SchemeHit) {
    if (drafts.some((d) => d.scheme.code === scheme.code)) {
      setBuilderNotice("That fund is already in your holdings.");
      return;
    }
    if (drafts.length >= 40) {
      setBuilderNotice("You can analyse up to 40 funds at a time.");
      return;
    }
    setBuilderNotice("");
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
  const needsAvgNav = drafts.some((d) => d.units > 0 && !(d.avg_nav > 0));
  const missingUnits = drafts.some((d) => !(d.units > 0));

  return (
    <div className="space-y-5">
      <StatementImport setDrafts={setDrafts} />

      <div className="builder-divider flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-line" /> or add funds manually <span className="h-px flex-1 bg-line" />
      </div>

      <SearchBar onSelect={add} />
      {builderNotice && (
        <p className="rounded-xl border border-caution/25 bg-caution/5 px-4 py-3 text-xs text-ink-dim" role="status">
          {builderNotice}
        </p>
      )}

      <AnimatePresence>
        {drafts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass rounded-2xl p-4 sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
                  Your holdings <span className="ml-1 rounded-full bg-brand/5 px-2 py-0.5 text-[10px] text-brand">{drafts.length} / 40</span>
                </h3>
                <p className="mt-1 text-[11px] text-ink-faint">Check every entry before running the analysis.</p>
              </div>
              {totalInvested > 0 && (
                <span className="text-xs text-ink-faint">
                  invested so far: {formatINR(totalInvested)}
                </span>
              )}
            </div>

            {needsAvgNav && (
              <p className="mb-3 rounded-lg border border-caution/25 bg-caution/5 px-3 py-2 text-xs text-ink-dim">
                Some funds need an average buy NAV (your statement didn&apos;t include a cost for
                them). Please fill those in before analysing.
              </p>
            )}

            <div className="space-y-2">
              {drafts.map((d) => (
                <div
                  key={d.scheme.code}
                  className="holding-editor flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center"
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
                      highlight={d.units > 0 && !(d.avg_nav > 0)}
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
              aria-describedby={!ready ? "portfolio-readiness" : undefined}
              className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-sm transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-ink-faint"
            >
              {ready
                ? "Analyze my portfolio →"
                : "Enter units and avg buy NAV for every fund"}
            </button>
            <p id="portfolio-readiness" className="mt-2 text-center text-[11px] text-ink-faint" aria-live="polite">
              {ready
                ? "Your entries are ready. The analysis uses current public NAV data."
                : missingUnits
                  ? "Add the number of units held for every fund."
                  : "Add an average buy NAV for every fund to calculate your personal returns."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {drafts.length === 0 && (
        <p className="text-center text-sm text-ink-faint">
          Upload your CAS to auto-fill your holdings, or search and add each fund manually.
        </p>
      )}
    </div>
  );
}

/* ----------------------------- CAS import ------------------------------ */

function StatementImport({ setDrafts }: { setDrafts: (d: DraftHolding[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "warn" | "err" } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function selectFile(input: HTMLInputElement) {
    const selected = input.files?.[0] ?? null;
    setPassword("");
    setNeedsPassword(false);
    if (selected && selected.size > CAS_MAX_BYTES) {
      setFile(null);
      setMsg({
        text: "This file is over the 15 MB limit. Choose a smaller CAS PDF or add your holdings manually.",
        tone: "err",
      });
      input.value = "";
      return;
    }
    setFile(selected);
    setMsg(null);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const r: ImportResult = await importStatement(file, password);
      if (r.status === "password_required") {
        setNeedsPassword(true);
        setMsg({ text: r.message ?? "This statement needs a password.", tone: "warn" });
      } else if (r.status === "error") {
        setMsg({ text: r.message ?? "Couldn't read this statement.", tone: "err" });
      } else {
        const holdings = r.holdings ?? [];
        setDrafts(holdings.map((h) => ({ scheme: h.scheme, units: h.units, avg_nav: h.avg_nav ?? 0 })));
        const parts = [`Imported ${holdings.length} active holding${holdings.length === 1 ? "" : "s"}.`];
        if (r.unmatched && r.unmatched.length) parts.push(`${r.unmatched.length} couldn't be matched and were skipped.`);
        if (r.stale && r.message) parts.push(r.message);
        setMsg({ text: parts.join(" "), tone: r.stale ? "warn" : "ok" });
      }
    } catch (error) {
      setMsg({
        text: error instanceof Error
          ? error.message
          : "We couldn't complete the import. Please try again.",
        tone: "err",
      });
    } finally {
      setBusy(false);
      setPassword(""); // never keep the password around
    }
  }

  const toneCls = {
    ok: "border-positive/25 bg-positive/5",
    warn: "border-caution/25 bg-caution/5",
    err: "border-negative/25 bg-negative/5",
  } as const;

  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
        Import from your statement (CAS)
      </h3>
      <p className="mt-1 text-xs text-ink-faint">
        Upload your CAMS/KFintech Consolidated Account Statement — we&apos;ll auto-fill your
        current holdings so you don&apos;t have to add them by hand.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] text-ink-faint">CAS PDF</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => selectFile(e.currentTarget)}
            className="block w-full text-sm text-ink-dim file:mr-3 file:rounded-lg file:border file:border-line file:bg-bg file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-brand/40"
          />
        </label>
        <label className={needsPassword ? "sm:w-48" : "sm:w-44"}>
          <span className="mb-1 block text-[11px] text-ink-faint">
            Password {needsPassword ? "(required)" : "(only if protected)"}
          </span>
          <input
            type="password"
            value={password}
            autoFocus={needsPassword}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            className={`w-full rounded-lg border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none transition focus:ring-2 focus:ring-brand/20 ${
              needsPassword ? "border-caution/50" : "border-line focus:border-brand"
            }`}
          />
        </label>
        <button
          onClick={run}
          disabled={!file || busy}
          className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition enabled:hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Reading…" : "Import"}
        </button>
      </div>

      {msg && (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-xs text-ink-dim ${toneCls[msg.tone]}`}>
          {msg.text}
        </p>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 10V8a6 6 0 1112 0v2M5 10h14v10H5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Processed in memory only — never saved or logged, password used once then discarded,
        nothing sent to any AI or web service.
      </p>
      <p className="mt-1 text-[11px] text-ink-faint">
        Maximum file size: 15 MB. If an upload is interrupted, check your connection and try again.
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  highlight,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  highlight?: boolean;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-0.5 text-[10px] text-ink-faint">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        className={`w-24 rounded-lg border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none transition focus:ring-2 focus:ring-brand/20 ${
          highlight ? "border-caution/60" : "border-line focus:border-brand"
        }`}
      />
    </label>
  );
}
