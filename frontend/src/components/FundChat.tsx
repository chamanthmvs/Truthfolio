"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { askFundQuestion, fetchCapabilities } from "@/lib/api";
import type { PortfolioChatMessage, ReviewResponse } from "@/lib/types";

const MAX_QUESTIONS = 5;
const SUGGESTED_QUESTIONS = [
  "Why did this fund get this verdict?",
  "What is the single biggest concern here?",
  "Explain the Sharpe ratio for this fund in simple terms.",
];

interface Props {
  review: ReviewResponse;
}

export default function FundChat({ review }: Props) {
  const [messages, setMessages] = useState<PortfolioChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // null = still checking; false = no AI provider configured (hide chat entirely).
  const [available, setAvailable] = useState<boolean | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const questionsAsked = messages.filter(({ role }) => role === "user").length;
  const limitReached = questionsAsked >= MAX_QUESTIONS;

  useEffect(() => {
    let active = true;
    fetchCapabilities().then((caps) => {
      if (active) setAvailable(caps.chat);
    });
    return () => {
      active = false;
    };
  }, []);

  // Reset the conversation when the fund under review changes (e.g. opening an alternative).
  useEffect(() => {
    setMessages([]);
    setQuestion("");
    setError("");
  }, [review.scheme_code]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [messages, loading]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (!content || loading || limitReached) return;

    const nextQuestion: PortfolioChatMessage = { role: "user", content };
    setLoading(true);
    setError("");
    try {
      const answer = await askFundQuestion(review, [...messages, nextQuestion]);
      setMessages((current) => [
        ...current,
        nextQuestion,
        { role: "assistant", content: answer },
      ]);
      setQuestion("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not get an answer. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Hide the chat entirely when no AI provider is configured (nothing to answer with).
  if (available !== true) return null;

  return (
    <section className="glass overflow-hidden rounded-2xl" aria-labelledby="fund-chat-title">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
                  <path d="M5 5.75A2.75 2.75 0 0 1 7.75 3h8.5A2.75 2.75 0 0 1 19 5.75v7.5A2.75 2.75 0 0 1 16.25 16H11l-4.5 4v-4.4A2.75 2.75 0 0 1 5 13.25v-7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M9 8h6M9 11.5h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <h2 id="fund-chat-title" className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
                Ask about this fund
              </h2>
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-faint">
              Ask a follow-up about this fund&apos;s verdict, metrics, peer ranking or evidence —
              answered only from the analysis shown above. Educational, not investment advice.
            </p>
          </div>
          <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-medium text-ink-faint">
            {questionsAsked}/{MAX_QUESTIONS} questions
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          When you send a question, this fund&apos;s analysis and the conversation are sent to the
          app&apos;s configured AI provider; the provider&apos;s own terms apply.
        </p>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
            {SUGGESTED_QUESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuestion(suggestion)}
                className="rounded-xl border border-line bg-white/70 px-3 py-2 text-left text-xs text-ink-dim transition hover:border-brand/30 hover:text-brand"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          <div ref={conversationRef} className="mb-4 max-h-96 space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite" aria-label="Fund conversation">
            {messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <p
                  className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[78%] ${
                    message.role === "user"
                      ? "rounded-br-md bg-brand text-white"
                      : "rounded-bl-md border border-line bg-white/80 text-ink-dim"
                  }`}
                >
                  {message.content}
                </p>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <p className="rounded-2xl rounded-bl-md border border-line bg-white/80 px-4 py-3 text-sm text-ink-faint" role="status">
                  Looking at this fund&apos;s analysis…
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="mb-3 text-sm text-negative" role="alert">{error}</p>}

        <form onSubmit={submit} className="mt-4 flex items-end gap-2">
          <label className="sr-only" htmlFor="fund-chat-question">Ask a question about this fund</label>
          <textarea
            id="fund-chat-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value.slice(0, 600))}
            maxLength={600}
            rows={2}
            disabled={loading || limitReached}
            placeholder={limitReached ? "You have used all five questions for this fund." : "Ask about this fund…"}
            className="min-h-11 flex-1 resize-y rounded-xl border border-line bg-white/80 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/40 focus:ring-2 focus:ring-brand/10 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || limitReached || !question.trim()}
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Thinking…" : "Ask"}
            {!loading && (
              <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
                <path d="M3.5 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </form>
        {!limitReached && (
          <p className="mt-2 text-right text-[10px] text-ink-faint">{question.length}/600 characters</p>
        )}
      </div>
    </section>
  );
}
