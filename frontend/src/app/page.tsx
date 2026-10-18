"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import SearchBar from "@/components/SearchBar";
import ThinkingStream from "@/components/ThinkingStream";
import FundReview from "@/components/FundReview";
import PortfolioBuilder from "@/components/PortfolioBuilder";
import PortfolioOverview from "@/components/PortfolioOverview";
import PortfolioChat from "@/components/PortfolioChat";
import HoldingsTable from "@/components/HoldingsTable";
import InsightsPanel from "@/components/InsightsPanel";
import MarketPulseView from "@/components/MarketPulseView";
import { streamReview, streamPortfolio } from "@/lib/api";
import type {
  DraftHolding,
  PortfolioHolding,
  PortfolioResponse,
  ReviewResponse,
  SchemeHit,
} from "@/lib/types";

type Tab = "fund" | "portfolio" | "market";

export default function Home() {
  const [tab, setTab] = useState<Tab>("fund");

  return (
    <main className="app-shell mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-7 sm:py-8 lg:px-10">
      <Header />
      <div className="app-intro">
        <div>
          <div className="app-eyebrow"><span /> YOUR MUTUAL FUNDS, IN CONTEXT</div>
          <p className="app-intro-copy">
            Clear-eyed analysis built from real data. <span>No hype. No hidden score.</span>
          </p>
        </div>
        <div className="app-data-note">
          <span className="app-data-indicator" />
          <span>AMFI + mfapi public data</span>
        </div>
      </div>
      <Tabs tab={tab} setTab={setTab} />
      <div className="mt-7">
        <section id="fund-panel" role="tabpanel" aria-labelledby="fund-tab" hidden={tab !== "fund"}>
          <FundFlow />
        </section>
        <section id="portfolio-panel" role="tabpanel" aria-labelledby="portfolio-tab" hidden={tab !== "portfolio"}>
          <PortfolioFlow />
        </section>
        <section id="market-panel" role="tabpanel" aria-labelledby="market-tab" hidden={tab !== "market"}>
          <MarketPulseView />
        </section>
      </div>
      <footer className="app-footer mt-16">
        <span>Truthfolio · Independent analysis, clearly explained.</span>
        <span>Educational only — not personalised investment advice.</span>
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
      {drill && (
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
      )}

      <div hidden={Boolean(drill)} className="space-y-6">
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
          <InsightsPanel mode="portfolio" summary={result.summary} holdings={result.holdings} />
          <PortfolioChat summary={result.summary} holdings={result.holdings} />
          <HoldingsTable holdings={result.holdings} onOpen={setDrill} />
          {result.errors > 0 && (
            <p className="text-center text-xs text-ink-faint">
              {result.errors} fund(s) could not be analysed and were left out.
            </p>
          )}
        </>
      )}
      </div>
    </div>
  );
}

/* ------------------------------- Shared --------------------------------- */

function Header() {
  return (
    <header className="app-header mb-7 flex items-center justify-between gap-4">
      <a href="https://chamanthmvs.github.io/Truthfolio/" className="flex items-center gap-3" aria-label="Truthfolio home">
        <Image
          src="/truthfolio-mark.svg"
          alt=""
          width={40}
          height={40}
          className="app-logo rounded-xl"
          priority
        />
        <div>
          <span className="block text-base font-semibold tracking-tight text-ink">Truthfolio</span>
          <span className="block text-[11px] text-ink-faint">The evidence-first fund review</span>
        </div>
      </a>
      <a
        href="https://github.com/chamanthmvs/Truthfolio/blob/main/docs/TECHNICAL.md"
        target="_blank"
        rel="noreferrer"
        className="app-guide-link"
      >
        How it works <span aria-hidden="true">↗</span>
      </a>
    </header>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { key: Tab; label: string; caption: string; icon: string }[] = [
    { key: "fund", label: "Fund review", caption: "One fund, examined", icon: "↗" },
    { key: "portfolio", label: "Portfolio", caption: "Your holdings, together", icon: "◫" },
    { key: "market", label: "Market pulse", caption: "The wider picture", icon: "⌁" },
  ];
  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>, current: Tab) {
    const index = items.findIndex((item) => item.key === current);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    const nextTab = items[next].key;
    setTab(nextTab);
    document.getElementById(`${nextTab}-tab`)?.focus();
  }
  return (
    <div className="app-tabs" role="tablist" aria-label="Analysis type">
      {items.map(({ key, label, caption, icon }) => (
        <button
          id={`${key}-tab`}
          key={key}
          onClick={() => setTab(key)}
          role="tab"
          aria-selected={tab === key}
          aria-controls={`${key}-panel`}
          tabIndex={tab === key ? 0 : -1}
          onKeyDown={(event) => handleTabKey(event, key)}
          className={`app-tab${tab === key ? " is-active" : ""}`}
        >
          <span className="app-tab-icon">
            {icon}
          </span>
          <span className="app-tab-text">
            <span className="app-tab-label">{label}</span>
            <span className="app-tab-caption">{caption}</span>
          </span>
          {tab === key && <span className="app-tab-active-mark" />}
        </button>
      ))}
    </div>
  );
}

function Hero({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="app-hero pt-7 text-center sm:pt-12">
      <motion.span
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="app-hero-eyebrow mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3.5 py-1.5 text-xs font-medium text-ink-dim shadow-sm"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-positive" />
        No hype <span>·</span> No jargon <span>·</span> Just evidence
      </motion.span>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="app-hero-title mx-auto max-w-[18ch] text-4xl font-extrabold leading-[1.04] tracking-[-0.03em] text-ink sm:text-6xl"
      >
        {title}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-5 max-w-[46ch] text-base leading-relaxed text-ink-dim sm:text-lg"
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
