"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMarketChart } from "@/lib/api";
import type {
  MarketChartProxy,
  MarketChartResponse,
  MarketChartStats,
  MarketHistoryPoint,
  MarketScenario,
} from "@/lib/types";

type ReadyChart = MarketChartResponse & {
  history: MarketHistoryPoint[];
  scenarios: MarketScenario[];
  proxy: MarketChartProxy;
  stats: MarketChartStats;
};

/* ---- geometry (viewBox units) ---- */
const W = 820;
const H = 390;
const M = { top: 18, right: 78, bottom: 36, left: 52 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const HISTORY_COLOR = "var(--brand)"; // #123d31 — the real, measured line
const SCENARIO_COLOR = "var(--caution)"; // #a5641b — illustrative, never a forecast

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(d)}%`;

export default function MarketChart() {
  const [data, setData] = useState<MarketChartResponse | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetchMarketChart()
      .then((r) => {
        if (!active) return;
        setData(r);
        setState("done");
      })
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

  if (!data || !data.available || !data.history || !data.scenarios || !data.proxy || !data.stats) {
    return (
      <section className="glass rounded-2xl p-5 sm:p-6 text-sm text-ink-dim">
        {data?.reason ?? "Market history is unavailable right now."}
      </section>
    );
  }

  return <Chart data={data as ReadyChart} />;
}

function Chart({ data }: { data: ReadyChart }) {
  const { history, scenarios, proxy, stats } = data;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ ratio: number; node: React.ReactNode } | null>(null);

  const geo = useMemo(() => {
    const t0 = new Date(proxy.inception).getTime();
    const tAsOf = new Date(proxy.as_of).getTime();
    const years = data.scenario_years ?? 10;
    const tEnd = tAsOf + years * 365.25 * 24 * 3600 * 1000;
    const span = tEnd - t0 || 1;

    const maxVal = Math.max(
      ...history.map((p) => p.value),
      ...scenarios.flatMap((s) => s.points.map((p) => p.value)),
    );
    const yMax = Math.ceil((maxVal * 1.05) / 250) * 250;

    const x = (t: number) => M.left + ((t - t0) / span) * PLOT_W;
    const y = (v: number) => M.top + PLOT_H - (v / yMax) * PLOT_H;
    const xAsOf = x(tAsOf);

    const histXY = history.map((p) => ({ t: new Date(p.date).getTime(), ...p, cx: x(new Date(p.date).getTime()), cy: y(p.value) }));
    const histLine = histXY.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(" ");
    const histArea = `${histLine} L${histXY[histXY.length - 1].cx.toFixed(1)} ${(M.top + PLOT_H).toFixed(1)} L${histXY[0].cx.toFixed(1)} ${(M.top + PLOT_H).toFixed(1)} Z`;

    const scenYearT = (yr: number) => tAsOf + yr * 365.25 * 24 * 3600 * 1000;
    const scenPaths = scenarios.map((s) => ({
      label: s.label,
      cagr: s.cagr,
      blurb: s.blurb,
      last: s.points[s.points.length - 1],
      endY: y(s.points[s.points.length - 1].value),
      d: s.points.map((p, i) => `${i ? "L" : "M"}${x(scenYearT(p.year)).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" "),
    }));

    // Band between the lowest and highest scenario (fan of outcomes).
    const lowS = scenarios.reduce((a, b) => (a.cagr <= b.cagr ? a : b));
    const highS = scenarios.reduce((a, b) => (a.cagr >= b.cagr ? a : b));
    const up = highS.points.map((p, i) => `${i ? "L" : "M"}${x(scenYearT(p.year)).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
    const downPts = [...lowS.points].reverse();
    const down = downPts.map((p) => `L${x(scenYearT(p.year)).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
    const band = `${up} ${down} Z`;

    // y gridlines
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += yMax >= 1500 ? 500 : 250) yTicks.push(v);

    // x year ticks
    const yearStart = new Date(proxy.inception).getFullYear();
    const yearEnd = new Date(tEnd).getFullYear();
    const totalYears = yearEnd - yearStart;
    const step = totalYears > 18 ? 4 : totalYears > 10 ? 3 : 2;
    const xTicks: { x: number; label: number }[] = [];
    for (let yr = yearStart; yr <= yearEnd; yr += step) {
      xTicks.push({ x: x(new Date(`${yr}-01-01`).getTime()), label: yr });
    }

    return { t0, tAsOf, tEnd, span, x, y, xAsOf, yMax, histXY, histLine, histArea, scenPaths, band, yTicks, xTicks };
  }, [history, scenarios, proxy, data.scenario_years]);

  function onMove(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const vbX = ratio * W;
    if (vbX < M.left || vbX > W - M.right) {
      setHover(null);
      return;
    }
    const t = geo.t0 + ((vbX - M.left) / PLOT_W) * geo.span;
    if (t <= geo.tAsOf) {
      // nearest real history point
      let best = geo.histXY[0];
      for (const p of geo.histXY) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      setHover({
        ratio: (geo.x(best.t) / W),
        node: (
          <>
            <div className="text-[10px] uppercase tracking-wider text-ink-faint">
              {new Date(best.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} · real
            </div>
            <div className="font-mono text-sm font-semibold text-ink">{inr(best.value)}</div>
            <div className="text-[10px] text-ink-faint">per ₹100 invested at the start</div>
          </>
        ),
      });
    } else {
      const yr = Math.round((t - geo.tAsOf) / (365.25 * 24 * 3600 * 1000));
      if (yr < 1) {
        setHover(null);
        return;
      }
      setHover({
        ratio: (geo.x(geo.tAsOf + yr * 365.25 * 24 * 3600 * 1000) / W),
        node: (
          <>
            <div className="text-[10px] uppercase tracking-wider text-ink-faint">
              Year {yr} · illustrative
            </div>
            {scenarios.map((s) => {
              const p = s.points.find((q) => q.year === yr);
              return (
                <div key={s.label} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-ink-dim">{(s.cagr * 100).toFixed(0)}%/yr</span>
                  <span className="font-mono text-ink">{p ? inr(p.value) : "—"}</span>
                </div>
              );
            })}
          </>
        ),
      });
    }
  }

  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
          The market&apos;s real path — and what steady growth would look like
        </h2>
        <span className="rounded-full border border-line px-2.5 py-1 text-[10px] text-ink-faint">
          Nifty 50 index-fund proxy
        </span>
      </div>
      <p className="mb-4 text-xs text-ink-faint">
        Growth of ₹100 in {proxy.scheme_name} ({proxy.history_years} years, to {proxy.as_of}). The
        solid line is real; the shaded fan is illustrative arithmetic, not a forecast.
      </p>

      {/* stat tiles */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="₹100 became" value={inr(stats.growth_multiple * 100)} />
        <Stat label="Since-start return" value={`${pct(stats.cagr_since_inception)}/yr`} />
        <Stat label="Last 10 years" value={`${pct(stats.cagr_10y)}/yr`} />
        <Stat label="Worst fall" value={pct(stats.worst_drawdown, 0)} tone="caution" />
      </div>

      <div ref={containerRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Growth of ₹100 invested in a Nifty 50 index fund over ${proxy.history_years} years became ${inr(stats.growth_multiple * 100)}, with illustrative scenarios at 8, 11 and 14 percent a year.`}
        >
          {/* y grid + labels */}
          {geo.yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={M.left - 8} y={geo.y(v) + 3} textAnchor="end" className="fill-[var(--ink-faint)]" fontSize={11}>
                {v === 0 ? "₹0" : inr(v)}
              </text>
            </g>
          ))}

          {/* x year labels */}
          {geo.xTicks.map((t) => (
            <text key={t.label} x={t.x} y={H - 14} textAnchor="middle" className="fill-[var(--ink-faint)]" fontSize={11}>
              {t.label}
            </text>
          ))}

          {/* scenario fan (illustrative) */}
          <path d={geo.band} fill={SCENARIO_COLOR} opacity={0.1} />
          {geo.scenPaths.map((s) => (
            <path key={s.label} d={s.d} fill="none" stroke={SCENARIO_COLOR} strokeWidth={1.6} strokeDasharray="5 4" opacity={0.85} />
          ))}

          {/* history (real) */}
          <path d={geo.histArea} fill={HISTORY_COLOR} opacity={0.07} />
          <path d={geo.histLine} fill="none" stroke={HISTORY_COLOR} strokeWidth={2} strokeLinejoin="round" />

          {/* today divider */}
          <line x1={geo.xAsOf} x2={geo.xAsOf} y1={M.top} y2={M.top + PLOT_H} stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
          <text x={geo.xAsOf} y={M.top - 6} textAnchor="middle" className="fill-[var(--ink-faint)]" fontSize={10}>
            today
          </text>

          {/* scenario endpoint labels */}
          {geo.scenPaths.map((s) => (
            <text key={s.label} x={W - M.right + 6} y={s.endY + 3} className="fill-[var(--caution)]" fontSize={11} fontWeight={600}>
              {(s.cagr * 100).toFixed(0)}%/yr
            </text>
          ))}

          {/* hover crosshair */}
          {hover && (
            <line x1={hover.ratio * W} x2={hover.ratio * W} y1={M.top} y2={M.top + PLOT_H} stroke="var(--ink-faint)" strokeWidth={1} opacity={0.5} />
          )}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[8rem] -translate-x-1/2 rounded-xl border border-line bg-bg-elev px-3 py-2 shadow-sm"
            style={{ left: `${Math.min(88, Math.max(12, hover.ratio * 100))}%` }}
          >
            {hover.node}
          </div>
        )}
      </div>

      {/* prominent illustrative endpoints — the scannable "where might it be" answer */}
      <div className="mt-4 rounded-xl border border-caution/25 bg-caution/[0.05] p-4">
        <div className="mb-2.5 text-[11px] uppercase tracking-wider text-ink-faint">
          Where the line could reach in {data.scenario_years} years — illustrative, not a forecast
        </div>
        <div className="grid grid-cols-3 gap-3">
          {scenarios.map((s) => {
            const end = s.points[s.points.length - 1];
            return (
              <div key={s.label} className="text-center">
                <div className="font-mono text-lg font-semibold text-ink sm:text-xl">{inr(end.value)}</div>
                <div className="mt-0.5 text-[10px] text-ink-faint">
                  {s.label} · a steady {(s.cagr * 100).toFixed(0)}%/yr
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-dim">
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke={HISTORY_COLOR} strokeWidth="2.5" /></svg>
          Actual history (real NAV)
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke={SCENARIO_COLOR} strokeWidth="2.5" strokeDasharray="5 4" /></svg>
          Illustrative scenarios (assumptions, not forecasts)
        </span>
      </div>

      {/* scenario note + disclaimer */}
      {data.scenario_note && (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-caution/25 bg-caution/[0.06] px-4 py-3 text-xs leading-relaxed text-ink-dim">
          <span className="mt-0.5 shrink-0 text-caution" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
              <path d="M12 8v5m0 3.5h.01M12 3l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>{data.scenario_note}</span>
        </div>
      )}

      {/* table view (accessibility + exact numbers) */}
      <details className="mt-3 text-xs text-ink-dim">
        <summary className="cursor-pointer text-ink-faint transition hover:text-ink">View the numbers as a table</summary>
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          <table className="w-full">
            <thead>
              <tr className="bg-black/[0.03] text-ink-faint">
                <th className="px-3 py-2 text-left font-medium">If it grew…</th>
                <th className="px-3 py-2 text-right font-medium">In 5 years</th>
                <th className="px-3 py-2 text-right font-medium">In 10 years</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.label} className="border-t border-line">
                  <td className="px-3 py-2">{(s.cagr * 100).toFixed(0)}% a year ({s.label})</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(s.points.find((p) => p.year === 5)?.value ?? 0)}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(s.points.find((p) => p.year === 10)?.value ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {data.disclaimer && <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">{data.disclaimer}</p>}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "caution" }) {
  return (
    <div className="rounded-xl border border-line bg-white/60 px-3 py-2.5">
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className={`mt-0.5 font-mono text-base font-semibold ${tone === "caution" ? "text-caution" : "text-ink"}`}>
        {value}
      </div>
    </div>
  );
}
