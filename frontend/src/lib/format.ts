import type { MetricOut, Tone, Verdict } from "./types";

export function formatMetric(m: MetricOut): string {
  if (m.value === null || m.value === undefined) return "—";
  switch (m.unit) {
    case "%":
      return `${(m.value * 100).toFixed(1)}%`;
    case "ratio":
      return m.value.toFixed(2);
    case "x":
      return `${m.value.toFixed(2)}×`;
    case "years":
      return `${m.value.toFixed(1)} yr`;
    default:
      return String(m.value);
  }
}

export function formatPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

/** Indian-format rupees with lakh/crore-friendly grouping, no decimals by default. */
export function formatINR(v: number, digits = 0): string {
  const neg = v < 0;
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  return `${neg ? "−" : ""}₹${formatted}`;
}

export const toneColor: Record<Tone, string> = {
  positive: "var(--positive)",
  neutral: "var(--neutral)",
  caution: "var(--caution)",
  negative: "var(--negative)",
};

export const toneText: Record<Tone, string> = {
  positive: "text-positive",
  neutral: "text-neutral",
  caution: "text-caution",
  negative: "text-negative",
};

export function verdictTone(v: Verdict): Tone {
  switch (v) {
    case "Continue":
      return "positive";
    case "Shift":
      return "caution";
    case "Stop":
      return "negative";
    default:
      return "neutral";
  }
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
