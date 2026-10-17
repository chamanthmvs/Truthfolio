"use client";

import { motion } from "framer-motion";
import type { PeerReport } from "@/lib/types";
import { ordinal } from "@/lib/format";

function toneForPct(p: number): string {
  if (p >= 0.66) return "var(--positive)";
  if (p >= 0.4) return "var(--neutral)";
  if (p >= 0.25) return "var(--caution)";
  return "var(--negative)";
}

export default function PeerBars({ peers }: { peers: PeerReport }) {
  const ranks = peers.ranks.filter((r) => r.percentile !== null);
  if (ranks.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        No comparable same-category peers could be analysed for this fund.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-faint">
        Percentile rank within <span className="text-ink-dim">{peers.category}</span> peers
        {" "}· {peers.peers_analysed} funds analysed (universe ~{peers.peer_universe_size}).
        Further right = better than more peers.
      </p>
      {ranks.map((r, i) => {
        const pct = r.percentile ?? 0;
        const color = toneForPct(pct);
        return (
          <div key={r.key}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-ink-dim">{r.label}</span>
              <span className="font-mono text-ink-faint">
                {ordinal(Math.round(pct * 100))} pctl
              </span>
            </div>
            <div className="relative h-2.5 w-full rounded-full bg-white/[0.06]">
              {/* median marker */}
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
              <motion.div
                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-bg"
                style={{ background: color, boxShadow: `0 0 10px ${color}aa` }}
                initial={{ left: "0%" }}
                animate={{ left: `calc(${pct * 100}% - 8px)` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
              />
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-1.5 pt-1 text-[11px] text-ink-faint">
        <span className="h-3 w-px bg-white/25" /> peer median
      </div>
    </div>
  );
}
