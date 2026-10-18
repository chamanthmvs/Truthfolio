"use client";

import type { Footnote } from "@/lib/types";

/**
 * Renders text that may contain inline citation markers like [1] or [2,3], turning each into
 * a small superscript link that jumps to the matching source in the footnotes list. This is
 * the citation service made visible — every web-sourced sentence is traceable to a source.
 */
export function CitedText({ text, className }: { text: string; className?: string }) {
  const parts = splitCitations(text);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <sup key={i} className="mx-0.5">
            {p.nums.map((n, j) => (
              <a
                key={j}
                href={`#cite-${n}`}
                className="rounded bg-brand/10 px-1 py-0.5 text-[10px] font-semibold text-brand no-underline transition hover:bg-brand/20"
              >
                {n}
                {j < p.nums.length - 1 ? "," : ""}
              </a>
            ))}
          </sup>
        ),
      )}
    </span>
  );
}

type Part = { type: "text"; value: string } | { type: "cite"; nums: number[] };

function splitCitations(text: string): Part[] {
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  const out: Part[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    const nums = m[1]
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    out.push({ type: "cite", nums });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function relColor(r: number): string {
  return r >= 0.8 ? "var(--positive)" : r >= 0.5 ? "var(--caution)" : "var(--negative)";
}

export function SourcesList({ footnotes }: { footnotes: Footnote[] }) {
  if (!footnotes || footnotes.length === 0) return null;
  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-ink-dim">Sources</h2>
      <p className="mb-4 text-xs text-ink-faint">
        Every web-sourced claim above is numbered to one of these, with a reliability score from
        our source-appraisal check.
      </p>
      <ol className="space-y-3">
        {footnotes.map((f) => (
          <li key={f.n} id={`cite-${f.n}`} className="flex gap-3 scroll-mt-20 text-sm">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand/10 text-[11px] font-semibold text-brand">
              {f.n}
            </span>
            <div className="min-w-0">
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                {f.title}
              </a>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-faint">
                <span>{f.domain}</span>
                {f.published && <span>{f.published}</span>}
                <span className="flex items-center gap-1.5" style={{ color: relColor(f.reliability) }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: relColor(f.reliability) }} />
                  {(f.reliability * 100).toFixed(0)}% reliable
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
