"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders the LLM's markdown narrative with the app's typography, and keeps our inline
 * citation markers working: `[1]` / `[2,3]` are rewritten to links (`#cite-n`) and rendered
 * as small superscript badges that jump to the Sources footnotes.
 */
function linkifyCitations(text: string): string {
  return text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_m, group: string) =>
    group
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => `[${n}](#cite-${n})`)
      .join(" "),
  );
}

export default function Markdown({ text, className }: { text: string; className?: string }) {
  const src = linkifyCitations(text);
  return (
    <div className={`space-y-2.5 text-sm leading-relaxed text-ink-dim ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="mt-4 text-base font-bold tracking-tight text-ink" {...p} />,
          h2: (p) => <h3 className="mt-4 text-base font-bold tracking-tight text-ink" {...p} />,
          h3: (p) => <h4 className="mt-3 text-sm font-semibold text-ink" {...p} />,
          h4: (p) => <h4 className="mt-3 text-sm font-semibold text-ink" {...p} />,
          p: (p) => <p className="text-ink-dim" {...p} />,
          strong: (p) => <strong className="font-semibold text-ink" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          ul: (p) => <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-faint" {...p} />,
          ol: (p) => <ol className="list-decimal space-y-1.5 pl-5 marker:text-ink-faint" {...p} />,
          li: (p) => <li className="pl-1 text-ink-dim" {...p} />,
          blockquote: (p) => (
            <blockquote className="border-l-2 border-line pl-3 italic text-ink-faint" {...p} />
          ),
          hr: () => <hr className="border-line" />,
          a: ({ href, children, ...rest }) =>
            href?.startsWith("#cite-") ? (
              <sup className="mx-0.5">
                <a
                  href={href}
                  className="rounded bg-brand/10 px-1 py-0.5 text-[10px] font-semibold text-brand no-underline transition hover:bg-brand/20"
                >
                  {children}
                </a>
              </sup>
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-brand underline decoration-dotted underline-offset-2"
                {...rest}
              >
                {children}
              </a>
            ),
        }}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
}
