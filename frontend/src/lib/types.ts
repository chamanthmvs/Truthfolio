export type Tone = "positive" | "neutral" | "caution" | "negative";
export type Verdict = "Continue" | "Stop" | "Shift" | "Inconclusive";

export interface SchemeHit {
  code: string;
  name: string;
  amc: string;
  category: string;
  scheme_type: string;
}

export interface Interpretation {
  label: string;
  tone: Tone;
}

export interface MetricOut {
  key: string;
  label: string;
  value: number | null;
  unit: string; // "%", "ratio", "x", "years"
  good_direction: "higher" | "lower";
  plain?: string;
  meaning?: string;
  why_it_matters?: string;
  how_to_read?: string;
  interpretation?: Interpretation;
}

export interface PeerRank {
  key: string;
  label: string;
  value: number | null;
  peer_median: number | null;
  percentile: number | null;
  peers_counted: number;
}

export interface PeerReport {
  category: string;
  peer_universe_size: number;
  peers_analysed: number;
  ranks: PeerRank[];
}

export interface RollingStat {
  window_years: number;
  observations: number;
  min_cagr: number;
  median_cagr: number;
  max_cagr: number;
  pct_negative: number;
}

export interface SourceRef {
  kind: string;
  title: string;
  url: string | null;
  reliability: number;
  reliability_reasons: string[];
}

export interface EvidenceItem {
  claim: string;
  category: string;
  direction: Tone;
  weight: number;
  confidence: number;
  sources: SourceRef[];
}

export interface PersonalHolding {
  units: number;
  avg_nav: number;
  current_nav: number;
  invested: number;
  current_value: number;
  gain: number;
  return_pct: number;
}

export interface CategorySlice {
  category: string;
  value: number;
  pct: number;
}

export interface Performer {
  scheme_name: string;
  scheme_code: string;
  return_pct: number;
  gain: number;
}

export interface PortfolioSummary {
  total_invested: number;
  total_current: number;
  total_gain: number;
  overall_return_pct: number;
  health_score: number;
  verdict: string; // "Healthy" | "Minor tweaks" | "Needs rebalancing"
  confidence: number;
  category_mix: CategorySlice[];
  hhi: number;
  top_holding_pct: number;
  top_category: string;
  top_category_pct: number;
  diversification: string;
  best_performer: Performer | null;
  worst_performer: Performer | null;
  action_items: string[];
  headline: string;
  caveats: string[];
}

export interface PortfolioHolding {
  review: ReviewResponse;
  personal: PersonalHolding;
  weight: number;
}

export interface PortfolioResponse {
  summary: PortfolioSummary;
  holdings: PortfolioHolding[];
  errors: number;
}

/** A holding being assembled in the builder, before analysis. */
export interface DraftHolding {
  scheme: SchemeHit;
  units: number;
  avg_nav: number;
}

export interface Insight {
  title: string;
  detail: string;
  category: string;
  tone: Tone;
}

export interface InsightsResponse {
  insights: Insight[];
  llm_used: boolean;
}

export interface Footnote {
  n: number;
  title: string;
  url: string;
  domain: string;
  reliability: number;
  published: string | null;
}

export interface ReviewResponse {
  scheme_code: string;
  scheme_name: string;
  category: string;
  as_of: string | null;
  verdict: Verdict;
  health_score: number;
  confidence: number;
  headline: string;
  narrative: string;
  caveats: string[];
  metrics: MetricOut[];
  rolling: RollingStat[];
  peers: PeerReport;
  evidence: EvidenceItem[];
  footnotes: Footnote[];
  steps: string[];
  llm_used: boolean;
  research_used: boolean;
}
