"use client";

/**
 * "Your data" transparency note. For a product whose USP is honesty, telling people plainly
 * what happens to their data is itself a feature. Reflects the real behaviour: no accounts,
 * no database — holdings and uploaded statements are used to compute the analysis, then dropped.
 */
export default function PrivacyNote() {
  return (
    <details className="mx-auto mt-12 max-w-2xl rounded-2xl border border-line bg-bg-elev px-5 py-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
            <path d="M6 10V8a6 6 0 1112 0v2M5 10h14v10H5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        Your data — what we keep (in short: nothing)
        <span className="ml-auto text-ink-faint" aria-hidden="true">▾</span>
      </summary>
      <div className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink-dim">
        <p>
          Truthfolio has <span className="font-semibold text-ink">no accounts and no database</span>.
          The funds you enter — and any statement you upload — are used to produce your analysis
          and then discarded. Close the tab and nothing of yours remains with us.
        </p>
        <p>
          <span className="font-semibold text-ink-dim">Statements (CAS):</span> read in memory
          only. The file and its password are never written to disk, never logged, and never
          stored — we keep just the fund holdings to show you the review, for that session.
        </p>
        <p>
          <span className="font-semibold text-ink-dim">AI features (when enabled):</span> if you
          use the chat or insights, your question and the on-screen analysis are sent to the
          configured AI provider to generate an answer. We don&apos;t save them; the provider&apos;s
          own terms apply.
        </p>
        <p className="text-ink-faint">
          Built on free, public data (AMFI, mfapi). Educational analysis — not personalised
          investment advice.
        </p>
      </div>
    </details>
  );
}
