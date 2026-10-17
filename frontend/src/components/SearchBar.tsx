"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { searchSchemes } from "@/lib/api";
import type { SchemeHit } from "@/lib/types";

interface Props {
  onSelect: (scheme: SchemeHit) => void;
}

export default function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SchemeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchSchemes(query, ctrl.signal);
        setHits(results);
        setOpen(true);
        setActive(0);
      } catch {
        /* aborted or failed */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function choose(hit: SchemeHit) {
    setQuery("");
    setHits([]);
    setOpen(false);
    onSelect(hit);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="glass-strong flex items-center gap-3 rounded-2xl px-5 py-4 shadow-2xl shadow-black/40">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => hits.length && setOpen(true)}
          placeholder="Search a mutual fund — e.g. Parag Parikh Flexi Cap, HDFC Mid Cap…"
          className="w-full bg-transparent text-base text-ink placeholder:text-ink-faint outline-none"
          aria-label="Search mutual funds"
        />
        {loading && <Spinner />}
      </div>

      <AnimatePresence>
        {open && hits.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute z-50 mt-2 max-h-[22rem] w-full overflow-auto rounded-2xl p-2 shadow-2xl shadow-black/60"
          >
            {hits.map((h, i) => (
              <li key={h.code}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(h)}
                  className={`flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition ${
                    i === active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">
                      {h.name}
                    </div>
                    <div className="truncate text-xs text-ink-faint">{h.amc}</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-dim">
                    {h.category}
                  </span>
                </button>
              </li>
            ))}
            <li className="px-4 pb-1 pt-2 text-[11px] text-ink-faint">
              Only real, AMFI-registered schemes appear here — no free-text funds.
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-ink-faint">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
  );
}
