"use client";

import { motion } from "framer-motion";
import type { Tone } from "@/lib/types";
import { toneColor } from "@/lib/format";

interface Props {
  score: number; // 0..100
  tone: Tone;
  size?: number;
}

export default function HealthGauge({ score, tone, size = 184 }: Props) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // 270° arc (gap at the bottom), starting bottom-left going clockwise.
  const startAngle = 135;
  const sweep = 270;
  const circ = 2 * Math.PI * r;
  const arcLen = (sweep / 360) * circ;
  const filled = (score / 100) * arcLen;
  const color = toneColor[tone];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[0deg]">
        <g transform={`rotate(${startAngle} ${cx} ${cy})`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${circ}`}
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`0 ${circ}`}
            animate={{ strokeDasharray: `${filled} ${circ}` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 10px ${color}66)` }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="font-mono text-4xl font-semibold tracking-tight"
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {Math.round(score)}
        </motion.span>
        <span className="text-[11px] uppercase tracking-widest text-ink-faint">
          Health / 100
        </span>
      </div>
    </div>
  );
}
