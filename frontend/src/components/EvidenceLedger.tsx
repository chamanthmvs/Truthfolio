"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { EvidenceItem } from "@/lib/types";
import { toneColor } from "@/lib/format";
import { CitedText } from "./Citations";

const DIR_LABEL: Record<string, string> = {
  positive: "Supports",
  negative: "Concern",
  neutral: "Context",
};

export default function EvidenceLedger({ evidence }: { evidence: EvidenceItem[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-faint">
        Every verdict is built only from these items. Each carries its source and a
        reliability score — expand to see why it was trusted.
      </p>
      {evidence.map((e, i) => (
        <EvidenceRow key={i} item={e} index={i} />
      ))}
    </div>
  );
}

function EvidenceRow({ item, index }: { item: EvidenceItem; index: number }) {
  const [open, setOpen] = useState(false);
  const color = toneColor[item.direction];

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="glass rounded-xl p-4"
    >
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left">
        <span
          className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: `${color}1c`, color }}
        >
          {DIR_LABEL[item.direction]}
        </span>
        <span className="flex-1 text-sm leading-snug text-ink">
          <CitedText text={item.claim} />
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-faint">
          w {item.weight.toFixed(2)}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3 border-t border-line pt-3">
              {item.sources.map((s, j) => (
                <div key={j} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-ink-dim">
                      <KindBadge kind={s.kind} />
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-dotted hover:text-ink"
                        >
                          {s.title}
                        </a>
                      ) : (
                        s.title
                      )}
                    </span>
                    <Reliability score={s.reliability} />
                  </div>
                  <ul className="mt-1.5 space-y-0.5 pl-1 text-ink-faint">
                    {s.reliability_reasons.map((r, k) => (
                      <li key={k} className="flex gap-1.5">
                        <span className="text-ink-faint">·</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const label = kind === "computed" ? "Computed" : kind === "web" ? "Web" : kind;
  return (
    <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
      {label}
    </span>
  );
}

function Reliability({ score }: { score: number }) {
  const color =
    score >= 0.8 ? "var(--positive)" : score >= 0.5 ? "var(--caution)" : "var(--negative)";
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px]" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {(score * 100).toFixed(0)}% reliable
    </span>
  );
}
