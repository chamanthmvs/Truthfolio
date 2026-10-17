"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import SearchBar from "@/components/SearchBar";
import ThinkingStream from "@/components/ThinkingStream";
import FundReview from "@/components/FundReview";
import PortfolioBuilder from "@/components/PortfolioBuilder";
import PortfolioOverview from "@/components/PortfolioOverview";
import HoldingsTable from "@/components/HoldingsTable";
import { streamReview, streamPortfolio } from "@/lib/api";
import type {
  DraftHolding,
  PortfolioHolding,
  PortfolioResponse,
  ReviewResponse,
  SchemeHit,
} from "@/lib/types";

type Tab = "fund" | "portfolio";

export default function Home() {
  const [tab, setTab] = useState<Tab>("fund");

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Header />
      <Tabs tab={tab} setTab={setTab} />
      <div className="mt-8">
        {tab === "fund" ? <FundFlow /> : <PortfolioFlow />}
      </div>
      <footer className="mt-16 border-t border-line pt-6 text-xs text-ink-faint">
        Educational analysis, not personalised investment advice. Built on public AMFI /
        mfapi NAV data. Every verdict is backed by evidence you can inspect.
      </footer>
    </main>
  );
}

/* ----------------------------- Single Fund ------------------------------ */

type Phase = "idle" | "running" | "done" | "error";

function FundFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [selected, setSelected] = useState<SchemeHit | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const onSelect = useCallback((scheme: SchemeHit) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSelected(scheme);
    setReview(null);
    setError("");
    setSteps([]);
    setPhase("running");
    streamReview(
      scheme.code,
      {
        onStep: (m) => setSteps((p) => [...p, m]),
        onResult: (r) => { setReview(r); setPhase("done"); },
        onError: (m) => { setError(m); setPhase("error"); },
      },
      ctrl.signal,
    );
  }, []);

  const reset = () => {
    abortRef.current?.abort();
    setPhase("idle"); setSelected(null); setReview(null); setSteps([]); setError("");
  };

  if (phase === "idle") {
    return (
      <div>
        <Hero
          title="A brutally honest second opinion on any fund."
          sub="Continue, Stop, or Shift — every verdict defended by evidence computed from real NAV data and ranked against peers."
        />
        <div className="mt-8">
          <SearchBar onSelect={onSelect} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-faint">
          {selected && <>Reviewing <span className="text-ink-dim">{selected.name}</span></>}
        </div>
        <NewButton onClick={reset} />
      </div>
      {(phase === "running" || (!review && phase !== "error")) && (
        <ThinkingStream steps={steps} done={phase === "done"} />
      )}
      {phase === "error" && <ErrorBox msg={error} />}
      {review && <FundReview review={review} />}
    </div>
  );
}

/* ------------------------------ Portfolio ------------------------------- */

interface PfProgress {
  done: number;
  total: number;
  events: string[];
}

function PortfolioFlow() {
  const [drafts, setDrafts] = useState<DraftHolding[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<PfProgress>({ done: 0, total: 0, events: [] });
  const [result, setResult] = useState<PortfolioResponse | null>(null);
  const [error, setError] = useState("");
  const [drill, setDrill] = useState<PortfolioHolding | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setResult(null);
    setError("");
    setDrill(null);
    setProgress({ done: 0, total: drafts.length, events: [] });
    setPhase("running");
    streamPortfolio(
      drafts,
      {
        onStart: (total) => setProgress({ done: 0, total, events: ["Starting analysis…"] }),
        onHolding: (p) =>
          setProgress((prev) => ({
            done: p.done,
            total: p.total,
            events: [
              ...prev.events,
              p.failed
                ? `A fund could not be analysed (${p.done}/${p.total}).`
                : `Reviewed ${p.scheme_name} → ${p.verdict} (${p.done}/${p.total}).`,
            ],
          })),
        onResult: (r) => { setResult(r); setPhase("done"); },
        onError: (m) => { setError(m); setPhase("error"); },
      },
      ctrl.signal,
    );
  }, [drafts]);

  const reset = () => {
    abortRef.current?.abort();
    setPhase("idle"); setResult(null); setError(""); setDrill(null);
  };

  // Drill-down view: reuse the full fund review, with the personal position.
  if (drill) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setDrill(null)}
          className="flex items-center gap-1.5 text-sm text-ink-dim transition hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to portfolio
        </button>
        <FundReview review={drill.review} personal={drill.personal} />
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div>
        <Hero
          title="How healthy is your whole portfolio?"
          sub="Add your funds with the units and average NAV you bought at. Get an honest, evidence-backed read on the whole portfolio and every fund in it."
        />
        <div className="mt-8">
          <PortfolioBuilder drafts={drafts} setDrafts={setDrafts} onAnalyze={analyze} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-faint">Your portfolio</div>
        <NewButton onClick={reset} label="Edit holdings" />
      </div>

      {phase === "running" && (
        <ThinkingStream steps={progress.events} done={false} />
      )}
      {phase === "error" && <ErrorBox msg={error} />}

      {result && (
        <>
          <PortfolioOverview summary={result.summary} />
          <HoldingsTable holdings={result.holdings} onOpen={setDrill} />
          {result.errors > 0 && (
            <p className="text-center text-xs text-ink-faint">
              {result.errors} fund(s) could not be analysed and were left out.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------- Shared --------------------------------- */

function Header() {
  return (
    <div className="mb-8 flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/20 text-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M3 17l5-5 4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="text-sm font-semibold tracking-tight text-ink">
        Honest Portfolio Reviewer
      </span>
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: [Tab, string][] = [
    ["fund", "Review a fund"],
    ["portfolio", "My portfolio"],
  ];
  return (
    <div className="inline-flex gap-1 rounded-full border border-line bg-white/[0.03] p-1">
      {items.map(([key, label]) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className="relative rounded-full px-4 py-1.5 text-sm font-medium transition"
        >
          {tab === key && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 rounded-full bg-brand/20"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <span className={tab === key ? "relative text-ink" : "relative text-ink-faint"}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

function Hero({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="text-center">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl text-3xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-[2.6rem]"
      >
        {title}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mx-auto mt-4 max-w-xl text-base text-ink-dim"
      >
        {sub}
      </motion.p>
    </div>
  );
}

function NewButton({ onClick, label = "New review" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-dim transition hover:text-ink"
    >
      {label}
    </button>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="glass rounded-2xl border-negative/30 p-6 text-sm text-negative">
      Something went wrong: {msg}
    </div>
  );
}
