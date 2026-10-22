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

export interface PortfolioChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** A holding being assembled in the builder, before analysis. */
export interface DraftHolding {
  scheme: SchemeHit;
  units: number;
  avg_nav: number;
}

export interface ImportedHolding {
  scheme: SchemeHit;
  units: number;
  avg_nav: number | null;
  current_value: number | null;
}

export interface ImportResult {
  status: "ok" | "password_required" | "error";
  reason?: string;
  message?: string | null;
  statement_date?: string | null;
  stale?: boolean;
  cas_type?: string | null;
  holdings?: ImportedHolding[];
  unmatched?: string[];
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

export interface MarketItem {
  text: string;
  tone: Tone;
}

export interface MarketSection {
  kind: "triggers" | "highlights" | "watchouts" | "outlook";
  title: string;
  items: MarketItem[];
}

export interface MarketMood {
  label: string;
  tone: Tone;
  summary: string;
}

export interface MarketPulse {
  mood: MarketMood;
  sections: MarketSection[];
}

export interface MarketHistoryPoint {
  date: string;
  value: number;
}

export interface MarketScenarioPoint {
  year: number;
  value: number;
}

export interface MarketScenario {
  label: string;
  cagr: number;
  blurb: string;
  points: MarketScenarioPoint[];
}

export interface MarketChartProxy {
  scheme_name: string;
  scheme_code: string;
  amc: string;
  inception: string;
  as_of: string;
  history_years: number;
}

export interface MarketChartStats {
  growth_multiple: number;
  cagr_since_inception: number | null;
  cagr_10y: number | null;
  cagr_5y: number | null;
  worst_drawdown: number;
}

export interface MarketChartResponse {
  available: boolean;
  reason?: string;
  proxy?: MarketChartProxy;
  history?: MarketHistoryPoint[];
  stats?: MarketChartStats;
  scenarios?: MarketScenario[];
  scenario_years?: number;
  scenario_note?: string;
  disclaimer?: string;
}

export interface Footnote {
  n: number;
  title: string;
  url: string;
  domain: string;
  reliability: number;
  published: string | null;
}

export interface RecommendationComparison {
  key: string;
  label: string;
  unit: string; // "%" | "ratio"
  alt_value: number | null;
  subject_value: number | null;
  better: boolean;
}

export interface Alternative {
  scheme_code: string;
  scheme_name: string;
  amc: string;
  category: string;
  strength_score: number;
  strength_edge: number | null;
  metrics_won: number;
  headline: string;
  reasons: string[];
  comparison: RecommendationComparison[];
}

export interface FundHistoryPoint {
  date: string;
  value: number;
}

export interface FundHistoryResponse {
  available: boolean;
  reason?: string;
  scheme_name?: string;
  inception?: string;
  as_of?: string;
  history_years?: number;
  history?: FundHistoryPoint[];
  stats?: {
    growth_multiple: number;
    cagr_since_inception: number | null;
    cagr_5y: number | null;
    worst_drawdown: number;
  };
  disclaimer?: string;
}

export interface RecommendationsResponse {
  subject: {
    scheme_code: string;
    scheme_name: string;
    category: string;
    strength_score: number | null;
  } | null;
  peers_considered: number;
  alternatives: Alternative[];
  basis: string;
  disclaimer: string;
  empty_reason: string | null;
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
