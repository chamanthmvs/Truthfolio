"use client";

import { AnimatePresence, motion } from "framer-motion";

export default function ThinkingStream({ steps, done }: { steps: string[]; done: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong rounded-2xl p-6"
    >
      <div className="mb-4 flex items-center gap-3">
        {!done && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-brand" />
        )}
        <span className="text-sm font-medium text-ink">
          {done ? "Review complete" : "Building the evidence…"}
        </span>
      </div>
      <ol className="space-y-3">
        <AnimatePresence initial={false}>
          {steps.map((s, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-3 text-sm text-ink-dim"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {s}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </motion.div>
  );
}
