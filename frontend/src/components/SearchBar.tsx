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
  const [searchError, setSearchError] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setOpen(false);
      setSearchError("");
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setSearchError("");
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchSchemes(query, ctrl.signal);
        setHits(results);
        setOpen(true);
        setActive(0);
      } catch (error) {
        if (!ctrl.signal.aborted) {
          setHits([]);
          setOpen(true);
          setSearchError(error instanceof Error ? error.message : "Search is temporarily unavailable.");
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
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
    setSearchError("");
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
      <div className="search-shell glass-strong flex items-center gap-3 rounded-2xl px-5 py-4">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => hits.length && setOpen(true)}
          placeholder="Search a mutual fund — e.g. Parag Parikh Flexi Cap, HDFC Mid Cap…"
          className="w-full bg-transparent text-base text-ink placeholder:text-ink-faint outline-none"
          aria-label="Search mutual funds"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open && hits.length > 0 ? "scheme-search-results" : undefined}
          aria-activedescendant={open && hits[active] ? `scheme-option-${hits[active].code}` : undefined}
          aria-busy={loading}
        />
        {loading ? <Spinner /> : query.length >= 2 && !searchError && hits.length > 0 ? (
          <span className="search-count">{hits.length} matches</span>
        ) : null}
      </div>

      <AnimatePresence>
        {open && hits.length > 0 && (
          <motion.ul
            id="scheme-search-results"
            role="listbox"
            aria-label="Matching mutual fund schemes"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute z-50 mt-2 max-h-[22rem] w-full overflow-auto rounded-2xl p-2 shadow-lg"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            {hits.map((h, i) => (
              <li key={h.code} id={`scheme-option-${h.code}`} role="option" aria-selected={i === active}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(h)}
                  tabIndex={-1}
                  className={`flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition ${
                    i === active ? "bg-brand/[0.08]" : "hover:bg-black/[0.035]"
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

        {/* No-match state: say so plainly instead of showing an empty dropdown. */}
        {open && !loading && !searchError && query.trim().length >= 2 && hits.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute z-50 mt-2 w-full rounded-2xl p-5 text-center"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <div className="text-sm font-medium text-ink">No such fund found</div>
            <div className="mt-1.5 text-xs leading-relaxed text-ink-faint">
              We couldn&apos;t find a match for &ldquo;{query.trim()}&rdquo;. Only real,
              AMFI-registered schemes can be analysed — check the spelling or try the
              fund&apos;s official name.
            </div>
          </motion.div>
        )}
        {open && searchError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute z-50 mt-2 w-full rounded-2xl p-5 text-center"
            role="alert"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <div className="text-sm font-medium text-negative">Search couldn&apos;t reach the fund list</div>
            <div className="mt-1.5 text-xs leading-relaxed text-ink-faint">
              Check your connection and try again. {searchError}
            </div>
          </motion.div>
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
    <span className="search-spinner" role="status" aria-label="Searching schemes" />
  );
}
