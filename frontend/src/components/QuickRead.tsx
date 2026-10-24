"use client";

import { useRef } from "react";
import { toneColor } from "@/lib/format";
import type { QuickReadData } from "@/lib/quickread";

/**
 * "Quick read" — a too-long-didn't-read popup. A single button that opens a native dialog with
 * a handful of factual, scannable bullets drawn entirely from data we already computed.
 */
export default function QuickRead({ data }: { data: QuickReadData }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/[0.06] px-3.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/[0.12]"
      >
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
          <path d="M13 2.5 4 11h4l-1 6.5 9-8.5h-4l1-6.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        Quick read
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="quick-read-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto max-h-[88dvh] w-[min(94vw,40rem)] max-w-none overflow-hidden rounded-2xl border border-line bg-bg-elev p-0 text-ink shadow-[var(--shadow-lg)] backdrop:bg-black/40"
      >
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-positive">
                The gist — too long, didn&apos;t read
              </p>
              <h2 id="quick-read-title" className="mt-1 truncate text-lg font-semibold tracking-tight sm:text-xl">
                {data.title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {data.verdict && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: `${toneColor[data.verdict.tone]}1f`,
                      color: toneColor[data.verdict.tone],
                      border: `1px solid ${toneColor[data.verdict.tone]}44`,
                    }}
                  >
                    {data.verdict.label}
                  </span>
                )}
                {data.subtitle && <span className="text-xs text-ink-faint">{data.subtitle}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-lg text-ink-dim transition hover:bg-bg-subtle hover:text-ink"
              aria-label="Close quick read"
              autoFocus
            >
              ×
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <ul className="space-y-3">
              {data.bullets.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: toneColor[b.tone] }}
                    aria-hidden
                  />
                  <span>{b.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
              A plain-language summary of this page — every point is computed from the same data
              shown in full below. Educational only, not personalised investment advice.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
