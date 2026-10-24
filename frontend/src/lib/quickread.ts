import { formatINR, formatPct, ordinal, verdictTone } from "./format";
import type {
  EvidenceItem,
  PersonalHolding,
  PortfolioSummary,
  ReviewResponse,
  Tone,
} from "./types";

export interface QuickBullet {
  tone: Tone;
  text: string;
}

export interface QuickReadData {
  title: string;
  subtitle?: string;
  verdict?: { label: string; tone: Tone };
  bullets: QuickBullet[];
}

function topEvidence(evidence: EvidenceItem[], direction: Tone[], n: number): EvidenceItem[] {
  return evidence
    .filter((e) => direction.includes(e.direction))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n);
}

/** A factual, scannable TL;DR of a single-fund review — all from already-computed data. */
export function buildFundQuickRead(review: ReviewResponse, personal?: PersonalHolding): QuickReadData {
  const bullets: QuickBullet[] = [];
  const vTone = verdictTone(review.verdict);

  bullets.push({
    tone: vTone,
    text: `The verdict is ${review.verdict} — a health score of ${review.health_score}/100, computed only from official NAV data.`,
  });

  // Peer standing — prefer 3-year return percentile, else the first ranked metric available.
  const rank =
    review.peers?.ranks?.find((r) => r.key === "ret_3y" && r.percentile !== null) ??
    review.peers?.ranks?.find((r) => r.percentile !== null);
  if (rank && rank.percentile !== null) {
    const p = Math.round(rank.percentile * 100);
    bullets.push({
      tone: p >= 50 ? "positive" : "caution",
      text: `Against its ${review.peers.category || "category"} peers it ranks around the ${ordinal(p)} percentile on ${rank.label.toLowerCase()}${rank.peers_counted ? ` (vs ${rank.peers_counted} funds)` : ""}.`,
    });
  }

  // Genuine strengths, then real watch-outs — in plain language straight from the ledger.
  for (const e of topEvidence(review.evidence ?? [], ["positive"], 2)) {
    bullets.push({ tone: "positive", text: e.claim });
  }
  for (const e of topEvidence(review.evidence ?? [], ["negative", "caution"], 2)) {
    bullets.push({ tone: e.direction === "negative" ? "negative" : "caution", text: e.claim });
  }

  // Consistency, from the longest rolling-return window we have.
  const roll = [...(review.rolling ?? [])].sort((a, b) => b.window_years - a.window_years)[0];
  if (roll) {
    const negPct = Math.round(roll.pct_negative * 100);
    bullets.push({
      tone: negPct === 0 ? "positive" : negPct <= 15 ? "neutral" : "caution",
      text:
        negPct === 0
          ? `Over every rolling ${roll.window_years}-year period in its history, it never ended in the red.`
          : `Over rolling ${roll.window_years}-year periods, it ended negative ${negPct}% of the time.`,
    });
  }

  // Your own position, if this is a holding you entered.
  if (personal) {
    const up = personal.gain >= 0;
    bullets.push({
      tone: up ? "positive" : "negative",
      text: `Your holding: ${formatINR(personal.invested)} invested is worth ${formatINR(personal.current_value)} today — ${up ? "up" : "down"} ${formatINR(Math.abs(personal.gain))} (${formatPct(personal.return_pct, 1)}).`,
    });
  }

  // One honest limit — the shortest caveat reads best here.
  const caveat = [...(review.caveats ?? [])].sort((a, b) => a.length - b.length)[0];
  if (caveat) bullets.push({ tone: "neutral", text: caveat });

  return {
    title: review.scheme_name,
    subtitle: review.category || undefined,
    verdict: { label: review.verdict, tone: vTone },
    bullets: bullets.slice(0, 9),
  };
}

function portfolioVerdictTone(v: string): Tone {
  if (v === "Healthy") return "positive";
  if (v === "Needs rebalancing") return "negative";
  return "caution";
}

/** A factual TL;DR of the whole portfolio. */
export function buildPortfolioQuickRead(summary: PortfolioSummary): QuickReadData {
  const bullets: QuickBullet[] = [];
  const vTone = portfolioVerdictTone(summary.verdict);

  bullets.push({
    tone: vTone,
    text: `${summary.verdict} — a portfolio health score of ${summary.health_score}/100.`,
  });

  const up = summary.total_gain >= 0;
  bullets.push({
    tone: up ? "positive" : "negative",
    text: `You've invested ${formatINR(summary.total_invested)}, now worth ${formatINR(summary.total_current)} — ${up ? "up" : "down"} ${formatINR(Math.abs(summary.total_gain))} (${formatPct(summary.overall_return_pct, 1)} in total, not annualised).`,
  });

  if (summary.diversification) {
    bullets.push({ tone: "neutral", text: summary.diversification });
  }

  if (summary.top_holding_pct) {
    const p = Math.round(summary.top_holding_pct * 100);
    bullets.push({
      tone: p >= 40 ? "caution" : "neutral",
      text: `Your largest single holding is ${p}% of the portfolio${summary.top_category ? `, and ${Math.round(summary.top_category_pct * 100)}% sits in ${summary.top_category}` : ""}.`,
    });
  }

  if (summary.best_performer) {
    bullets.push({
      tone: "positive",
      text: `Best performer: ${summary.best_performer.scheme_name} (${formatPct(summary.best_performer.return_pct, 1)}).`,
    });
  }
  if (summary.worst_performer) {
    bullets.push({
      tone: "caution",
      text: `Weakest: ${summary.worst_performer.scheme_name} (${formatPct(summary.worst_performer.return_pct, 1)}).`,
    });
  }

  for (const a of (summary.action_items ?? []).slice(0, 2)) {
    bullets.push({ tone: "caution", text: a });
  }

  const caveat = [...(summary.caveats ?? [])].sort((a, b) => a.length - b.length)[0];
  if (caveat) bullets.push({ tone: "neutral", text: caveat });

  return {
    title: "Your portfolio at a glance",
    verdict: { label: summary.verdict, tone: vTone },
    bullets: bullets.slice(0, 9),
  };
}
