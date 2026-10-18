import type {
  DraftHolding,
  EvidenceItem,
  Footnote,
  ImportResult,
  InsightsResponse,
  PortfolioChatMessage,
  PortfolioResponse,
  PortfolioSummary,
  ReviewResponse,
  SchemeHit,
} from "./types";

/** Upload a CAS PDF (+ optional password) and get back matched holdings. */
export async function importStatement(file: File, password: string): Promise<ImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("password", password);
  const res = await fetch(`${API_BASE}/portfolio/import`, { method: "POST", body: fd });
  if (res.status === 413) return { status: "error", message: "That file is too large — upload the CAS PDF itself." };
  if (!res.ok) throw new Error(`import failed: ${res.status}`);
  return res.json();
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8077/api";

export async function searchSchemes(
  query: string,
  signal?: AbortSignal,
): Promise<SchemeHit[]> {
  const res = await fetch(
    `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=10`,
    { signal },
  );
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  const data = await res.json();
  return data.results as SchemeHit[];
}

export interface ResearchResponse {
  enabled: boolean;
  reason?: string;
  evidence: EvidenceItem[];
  footnotes: Footnote[];
  budget?: { used_today: number; daily_cap: number };
}

/** On-demand web research for one fund — the only call that spends search credits. */
export async function fetchResearch(schemeCode: string): Promise<ResearchResponse> {
  const res = await fetch(`${API_BASE}/research?scheme_code=${encodeURIComponent(schemeCode)}`);
  if (!res.ok) throw new Error(`research failed: ${res.status}`);
  return res.json();
}

export interface StreamHandlers {
  onStep: (message: string) => void;
  onResult: (result: ReviewResponse) => void;
  onError: (message: string) => void;
}

/**
 * Stream a fund review over Server-Sent Events, surfacing each pipeline step as the
 * agent works, then the final verdict. We parse the SSE frames manually so the UI can
 * show the reasoning being *earned* rather than a blank spinner.
 */
export async function streamReview(
  schemeCode: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/review/stream?scheme_code=${encodeURIComponent(schemeCode)}`,
    { signal, headers: { Accept: "text/event-stream" } },
  );
  if (!res.ok || !res.body) {
    handlers.onError(`review failed: ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const lines = frame.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const payload = JSON.parse(data);
        if (event === "step") handlers.onStep(payload.message);
        else if (event === "result") handlers.onResult(payload as ReviewResponse);
        else if (event === "error") handlers.onError(payload.message);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}

export interface MarketPulseResponse {
  enabled: boolean;
  reason?: string;
  message?: string;
  pulse: import("./types").MarketPulse | null;
  footnotes: Footnote[];
  budget?: { used_today: number; daily_cap: number };
}

/** Today's market pulse (cited, cached, credit-aware). */
export async function fetchMarketPulse(focus?: string): Promise<MarketPulseResponse> {
  const q = focus ? `?focus=${encodeURIComponent(focus)}` : "";
  const res = await fetch(`${API_BASE}/market-pulse${q}`);
  if (!res.ok) throw new Error(`market pulse failed: ${res.status}`);
  return res.json();
}

/** Insight cards for one fund (LLM-synthesised, cached; deterministic fallback). */
export async function fetchFundInsights(schemeCode: string): Promise<InsightsResponse> {
  const res = await fetch(`${API_BASE}/insights?scheme_code=${encodeURIComponent(schemeCode)}`);
  if (!res.ok) throw new Error(`insights failed: ${res.status}`);
  return res.json();
}

/** Portfolio-level insight cards from an already-computed summary + brief holdings. */
export async function fetchPortfolioInsights(
  summary: PortfolioSummary,
  holdings: { scheme_name: string; category: string; weight: number; verdict: string; return_pct: number }[],
): Promise<InsightsResponse> {
  const res = await fetch(`${API_BASE}/insights/portfolio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary, holdings }),
  });
  if (!res.ok) throw new Error(`insights failed: ${res.status}`);
  return res.json();
}

/** Ask one bounded follow-up question about an already-computed portfolio. */
export async function askPortfolioQuestion(
  summary: PortfolioSummary,
  holdings: PortfolioResponse["holdings"],
  messages: PortfolioChatMessage[],
): Promise<string> {
  const context = {
    total_invested: summary.total_invested,
    total_current: summary.total_current,
    total_gain: summary.total_gain,
    overall_return_pct: summary.overall_return_pct * 100,
    health_score: summary.health_score,
    verdict: summary.verdict,
    diversification: summary.diversification,
    top_holding_pct: summary.top_holding_pct * 100,
    top_category: summary.top_category,
    top_category_pct: summary.top_category_pct * 100,
    category_mix: summary.category_mix
      .slice(0, 20)
      .map(({ category, pct }) => ({ category, pct: pct * 100 })),
    headline: summary.headline,
    action_items: summary.action_items.slice(0, 10),
    caveats: summary.caveats.slice(0, 10),
  };
  const analyzedHoldings = holdings.map(({ review, personal, weight }) => ({
    scheme_name: review.scheme_name,
    category: review.category,
    verdict: review.verdict,
    health_score: review.health_score,
    weight: weight * 100,
    invested: personal.invested,
    current_value: personal.current_value,
    gain: personal.gain,
    return_pct: personal.return_pct * 100,
    headline: review.headline.slice(0, 500),
    metrics: review.metrics.slice(0, 12).map(({ label, value, unit }) => ({
      label,
      value: value === null ? null : unit === "%" ? value * 100 : value,
      unit,
    })),
    evidence: review.evidence.slice(0, 8).map(({ claim }) => claim.slice(0, 400)),
    peer_summary: review.peers.ranks
      .filter((rank) => rank.percentile !== null)
      .slice(0, 4)
      .map((rank) => `${rank.label}: ${Math.round((rank.percentile ?? 0) * 100)}th percentile`)
      .join("; "),
  }));
  const res = await fetch(`${API_BASE}/portfolio/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context, holdings: analyzedHoldings, messages }),
  });
  if (!res.ok) {
    let message = `Portfolio chat failed (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // Preserve the status-based error when the server response is not JSON.
    }
    throw new Error(message);
  }
  const body = await res.json();
  if (typeof body.answer !== "string" || !body.answer.trim()) {
    throw new Error("The portfolio assistant returned an invalid response.");
  }
  return body.answer;
}

export interface PortfolioHandlers {
  onStart: (total: number) => void;
  onHolding: (p: { done: number; total: number; scheme_name?: string; verdict?: string; failed?: boolean }) => void;
  onResult: (result: PortfolioResponse) => void;
  onError: (message: string) => void;
}

/** Stream a whole-portfolio analysis, emitting each fund as it finishes, then the overview. */
export async function streamPortfolio(
  holdings: DraftHolding[],
  handlers: PortfolioHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const body = {
    holdings: holdings.map((h) => ({
      scheme_code: h.scheme.code,
      units: h.units,
      avg_nav: h.avg_nav,
    })),
  };
  const res = await fetch(`${API_BASE}/portfolio/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    handlers.onError(`portfolio analysis failed: ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const lines = frame.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const payload = JSON.parse(data);
        if (event === "start") handlers.onStart(payload.total);
        else if (event === "holding") handlers.onHolding(payload);
        else if (event === "result") handlers.onResult(payload as PortfolioResponse);
        else if (event === "error") handlers.onError(payload.message);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
