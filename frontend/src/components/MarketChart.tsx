"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMarketChart } from "@/lib/api";
import { toneColor } from "@/lib/format";
import type {
  MarketChartResponse,
  MarketScenarioRate,
  MarketSegment,
} from "@/lib/types";

type Ready = MarketChartResponse & { segments: MarketSegment[] };

/* ---- geometry (viewBox units) ---- */
const W = 820;
const H = 380;
const M = { top: 18, right: 64, bottom: 34, left: 54 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const HISTORY_COLOR = "var(--brand)"; // the real, measured line
const SCENARIO_COLOR = "var(--caution)"; // illustrative, never a forecast

const DAY = 24 * 3600 * 1000;
const YEAR = 365.25 * DAY;

const RANGES = [
  { key: "1m", label: "1M", days: 30 },
  { key: "3m", label: "3M", days: 91 },
  { key: "6m", label: "6M", days: 182 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "3y", label: "3Y", days: 365 * 3 },
  { key: "5y", label: "5Y", days: 365 * 5 },
  { key: "max", label: "Max", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];
const SHOW_SCENARIOS = new Set<RangeKey>(["5y", "max"]);

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

function retColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return "var(--ink-faint)";
  if (v > 0.001) return "var(--positive)";
  if (v < -0.001) return "var(--negative)";
  return "var(--ink-dim)";
}

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return step * mag;
}

export default function MarketChart() {
  const [data, setData] = useState<MarketChartResponse | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetchMarketChart()
      .then((r) => active && (setData(r), setState("done")))
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, []);

  if (state === "error") return null;

  if (state === "loading") {
    return (
      <section className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3 text-sm text-ink-dim">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-brand" />
          Loading the market&apos;s real history…
        </div>
      </section>
    );
  }

  if (!data || !data.available || !data.segments || data.segments.length === 0) {
    return (
      <section className="glass rounded-2xl p-5 text-sm text-ink-dim sm:p-6">
        {data?.reason ?? "Market history is unavailable right now."}
      </section>
    );
  }

  return <MarketView data={data as Ready} />;
}

function MarketView({ data }: { data: Ready }) {
  const { segments } = data;
  const [segKey, setSegKey] = useState(segments[0].key);
  const [range, setRange] = useState<RangeKey>("max");

  const segment = segments.find((s) => s.key === segKey) ?? segments[0];
  const showScenarios = SHOW_SCENARIOS.has(range);
  const rates = data.scenario_rates ?? [];
  const scenarioYears = data.scenario_years ?? 10;

  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
          The market&apos;s real path — ₹100 over time
        </h2>
        <span className="rounded-full border border-line px-2.5 py-1 text-[10px] text-ink-faint">
          As of {data.as_of} · NAV, ~1 day behind
        </span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-ink-faint">
        Growth of ₹100 in {segment.proxy.scheme_name}. The solid line is real NAV history; it
        posts end-of-day, so it is about one trading day behind — not a live index level.
      </p>

      {/* segment selector */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Market segment">
        {segments.map((s) => {
          const active = s.key === segKey;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={active}
              onClick={() => setSegKey(s.key)}
              title={s.blurb}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-line text-ink-dim hover:border-brand/40 hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* range buttons */}
      <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Time range">
        {RANGES.map((r) => {
          const active = r.key === range;
          return (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              aria-pressed={active}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums transition ${
                active ? "bg-ink text-white" : "text-ink-faint hover:bg-black/[0.04] hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <Plot
        key={segKey + range}
        segment={segment}
        range={range}
        showScenarios={showScenarios}
        rates={rates}
        scenarioYears={scenarioYears}
      />

      {/* deterministic read */}
      {data.read && (
        <div className="mt-5 rounded-xl border border-line bg-white/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-ink-faint">
              A read of the numbers
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                background: `${toneColor[data.read.tone]}1f`,
                color: toneColor[data.read.tone],
                border: `1px solid ${toneColor[data.read.tone]}44`,
              }}
            >
              {data.read.label}
            </span>
          </div>
          <ul className="space-y-1.5 text-sm leading-relaxed text-ink-dim">
            {data.read.sentences.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          {data.read_note && <p className="mt-2.5 text-[11px] text-ink-faint">{data.read_note}</p>}
        </div>
      )}

      {/* comparison strip — every segment at a glance (also selects) */}
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-[minmax(0,1fr)_3.75rem_3.75rem] bg-black/[0.03] px-3 py-2 text-[11px] font-medium text-ink-faint">
          <span>Segment</span>
          <span className="text-right">3 mo</span>
          <span className="text-right">1 yr</span>
        </div>
        {segments.map((s) => (
          <button
            key={s.key}
            onClick={() => setSegKey(s.key)}
            className={`grid w-full grid-cols-[minmax(0,1fr)_3.75rem_3.75rem] items-center border-t border-line px-3 py-2 text-left transition hover:bg-black/[0.02] ${
              s.key === segKey ? "bg-brand/[0.04]" : ""
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-ink">{s.label}</span>
              <span className="block truncate text-[10px] text-ink-faint">{s.blurb}</span>
            </span>
            <span className="text-right font-mono text-xs" style={{ color: retColor(s.returns.m3) }}>
              {pct(s.returns.m3)}
            </span>
            <span className="text-right font-mono text-xs" style={{ color: retColor(s.returns.y1) }}>
              {pct(s.returns.y1)}
            </span>
          </button>
        ))}
      </div>

      {data.disclaimer && (
        <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">{data.disclaimer}</p>
      )}
    </section>
  );
}

function Plot({
  segment,
  range,
  showScenarios,
  rates,
  scenarioYears,
}: {
  segment: MarketSegment;
  range: RangeKey;
  showScenarios: boolean;
  rates: MarketScenarioRate[];
  scenarioYears: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; node: React.ReactNode } | null>(null);

  const geo = useMemo(() => {
    const all = segment.history.map((p) => ({ t: new Date(p.d).getTime(), v: p.v }));
    const days = RANGES.find((r) => r.key === range)!.days;
    const lastT = all[all.length - 1].t;
    const cut = days === Infinity ? -Infinity : lastT - days * DAY;
    let win = all.filter((p) => p.t >= cut);
    if (win.length < 2) win = all.slice(-2);

    const base = win[0].v;
    const pts = win.map((p) => ({ t: p.t, v: (p.v / base) * 100 }));
    const lastV = pts[pts.length - 1].v;

    // scenarios: grow today's value at each fixed rate (long ranges only)
    const scen =
      showScenarios && rates.length
        ? rates.map((r) => ({
            label: r.label,
            rate: r.rate,
            points: Array.from({ length: scenarioYears + 1 }, (_, yr) => ({
              t: lastT + yr * YEAR,
              v: lastV * Math.pow(1 + r.rate, yr),
            })),
          }))
        : [];

    const t0 = pts[0].t;
    const tEnd = showScenarios ? lastT + scenarioYears * YEAR : lastT;
    const span = tEnd - t0 || 1;

    const maxVal = Math.max(...pts.map((p) => p.v), ...scen.flatMap((s) => s.points.map((p) => p.v)));
    // Long views (with scenarios) anchor at 0; short, flat ranges read better zoomed in.
    const minVal = showScenarios ? 0 : Math.min(...pts.map((p) => p.v));
    const pad = (maxVal - minVal) * 0.08 || maxVal * 0.08 || 1;
    const hi = maxVal + pad;
    const lo = showScenarios ? 0 : Math.max(0, minVal - pad);
    const step = niceStep(hi - lo);
    const yMax = Math.ceil(hi / step) * step;
    const yMin = Math.floor(lo / step) * step;

    const x = (t: number) => M.left + ((t - t0) / span) * PLOT_W;
    const y = (v: number) => M.top + PLOT_H - ((v - yMin) / (yMax - yMin || 1)) * PLOT_H;

    const histXY = pts.map((p) => ({ ...p, cx: x(p.t), cy: y(p.v) }));
    const histLine = histXY.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(" ");
    const base_y = y(yMin);
    const histArea = `${histLine} L${histXY[histXY.length - 1].cx.toFixed(1)} ${base_y.toFixed(1)} L${histXY[0].cx.toFixed(1)} ${base_y.toFixed(1)} Z`;

    const scenPaths = scen.map((s) => ({
      label: s.label,
      rate: s.rate,
      endV: s.points[s.points.length - 1].v,
      endY: y(s.points[s.points.length - 1].v),
      points: s.points,
      d: s.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" "),
    }));

    // y ticks
    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax + 0.5; v += step) yTicks.push(Math.round(v));

    // x ticks: ~5 across the span, formatted by total span length
    const spanYears = span / YEAR;
    const xTicks: { x: number; label: string }[] = [];
    const nTicks = 5;
    for (let i = 0; i <= nTicks; i++) {
      const t = t0 + (span * i) / nTicks;
      const dt = new Date(t);
      const label =
        spanYears > 2.2
          ? `${dt.getFullYear()}`
          : dt.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      xTicks.push({ x: x(t), label });
    }

    return { all, pts, histXY, histLine, histArea, scenPaths, x, y, t0, tEnd, span, lastT, lastV, yMin, yMax, yTicks, xTicks };
  }, [segment, range, showScenarios, rates, scenarioYears]);

  function onMove(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const vbX = ratio * W;
    if (vbX < M.left || vbX > W - M.right) return setHover(null);
    const t = geo.t0 + ((vbX - M.left) / PLOT_W) * geo.span;

    if (t <= geo.lastT || geo.scenPaths.length === 0) {
      let best = geo.histXY[0];
      for (const p of geo.histXY) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      setHover({
        x: geo.x(best.t),
        node: (
          <>
            <div className="text-[10px] uppercase tracking-wider text-ink-faint">
              {new Date(best.t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · real
            </div>
            <div className="font-mono text-sm font-semibold text-ink">{inr(best.v)}</div>
            <div className="text-[10px] text-ink-faint">per ₹100 at the start of this range</div>
          </>
        ),
      });
    } else {
      const yr = Math.max(1, Math.round((t - geo.lastT) / YEAR));
      setHover({
        x: geo.x(geo.lastT + yr * YEAR),
        node: (
          <>
            <div className="text-[10px] uppercase tracking-wider text-ink-faint">Year {yr} · illustrative</div>
            {geo.scenPaths.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-ink-dim">{(s.rate * 100).toFixed(0)}%/yr</span>
                <span className="font-mono text-ink">{inr(s.points.find((p) => Math.round((p.t - geo.lastT) / YEAR) === yr)?.v ?? 0)}</span>
              </div>
            ))}
          </>
        ),
      });
    }
  }

  const periodReturn = geo.lastV / 100 - 1;

  return (
    <>
      {/* stat tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="₹100 became" value={inr(geo.lastV)} />
        <Stat label="This range" value={pct(periodReturn)} tone={periodReturn < 0 ? "neg" : "pos"} />
        <Stat label={`Since ${new Date(segment.proxy.inception).getFullYear()}`} value={`${pct(segment.stats.cagr_since_inception)}/yr`} />
        <Stat label="Worst fall ever" value={pct(segment.stats.worst_drawdown, 0)} tone="caution" />
      </div>

      <div ref={containerRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
          aria-label={`Growth of ₹100 in ${segment.label}; ₹100 became ${inr(geo.lastV)} over this range.`}>
          {geo.yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={M.left - 8} y={geo.y(v) + 3} textAnchor="end" className="fill-[var(--ink-faint)]" fontSize={11}>{inr(v)}</text>
            </g>
          ))}
          {geo.xTicks.map((t, i) => (
            <text key={i} x={t.x} y={H - 12} textAnchor="middle" className="fill-[var(--ink-faint)]" fontSize={11}>{t.label}</text>
          ))}

          {/* scenario fan (illustrative) */}
          {geo.scenPaths.map((s) => (
            <path key={s.label} d={s.d} fill="none" stroke={SCENARIO_COLOR} strokeWidth={1.6} strokeDasharray="5 4" opacity={0.85} />
          ))}

          {/* history (real) */}
          <path d={geo.histArea} fill={HISTORY_COLOR} opacity={0.07} />
          <path d={geo.histLine} fill="none" stroke={HISTORY_COLOR} strokeWidth={2} strokeLinejoin="round" />

          {/* today divider + scenario end labels (long ranges) */}
          {geo.scenPaths.length > 0 && (
            <>
              <line x1={geo.x(geo.lastT)} x2={geo.x(geo.lastT)} y1={M.top} y2={M.top + PLOT_H} stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
              <text x={geo.x(geo.lastT)} y={M.top - 6} textAnchor="middle" className="fill-[var(--ink-faint)]" fontSize={10}>today</text>
              {geo.scenPaths.map((s) => (
                <text key={s.label} x={W - M.right + 5} y={s.endY + 3} className="fill-[var(--caution)]" fontSize={11} fontWeight={600}>{(s.rate * 100).toFixed(0)}%</text>
              ))}
            </>
          )}

          {hover && <line x1={hover.x} x2={hover.x} y1={M.top} y2={M.top + PLOT_H} stroke="var(--ink-faint)" strokeWidth={1} opacity={0.5} />}
        </svg>

        {hover && (
          <div className="pointer-events-none absolute top-2 z-10 min-w-[8rem] -translate-x-1/2 rounded-xl border border-line bg-bg-elev px-3 py-2 shadow-sm"
            style={{ left: `${Math.min(86, Math.max(14, (hover.x / W) * 100))}%` }}>
            {hover.node}
          </div>
        )}
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-dim">
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke={HISTORY_COLOR} strokeWidth="2.5" /></svg>
          Actual history (real NAV)
        </span>
        {showScenarios && (
          <span className="inline-flex items-center gap-2">
            <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke={SCENARIO_COLOR} strokeWidth="2.5" strokeDasharray="5 4" /></svg>
            Illustrative scenarios (assumptions, not forecasts)
          </span>
        )}
      </div>

      {showScenarios && (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-caution/25 bg-caution/[0.06] px-4 py-3 text-xs leading-relaxed text-ink-dim">
          <span className="mt-0.5 shrink-0 text-caution" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
              <path d="M12 8v5m0 3.5h.01M12 3l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>
            The dotted lines are illustrative arithmetic, not forecasts — each simply grows today&apos;s
            value at a fixed, assumed rate. Real markets never move in a straight line, and nobody can
            reliably predict 5-to-10-year returns.
          </span>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "caution" | "pos" | "neg" }) {
  const color =
    tone === "caution" ? "text-caution" : tone === "neg" ? "text-negative" : tone === "pos" ? "text-positive" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-white/60 px-3 py-2.5">
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className={`mt-0.5 font-mono text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}
