"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchFundHistory } from "@/lib/api";
import type { FundHistoryPoint, FundHistoryResponse } from "@/lib/types";

/* geometry (viewBox units) */
const W = 820;
const H = 300;
const M = { top: 16, right: 20, bottom: 32, left: 52 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const LINE = "var(--brand)";

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(d)}%`;

export default function FundHistoryChart({ schemeCode }: { schemeCode: string }) {
  const [data, setData] = useState<FundHistoryResponse | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    setData(null);
    fetchFundHistory(schemeCode)
      .then((r) => active && (setData(r), setState("done")))
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [schemeCode]);

  if (state === "error") return null;
  if (state === "loading") {
    return (
      <section className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3 text-sm text-ink-dim">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-brand" />
          Charting this fund&apos;s real growth…
        </div>
      </section>
    );
  }
  if (!data || !data.available || !data.history || !data.stats) return null;

  return <Chart data={data} history={data.history} />;
}

function Chart({ data, history }: { data: FundHistoryResponse; history: FundHistoryPoint[] }) {
  const stats = data.stats!;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; p: FundHistoryPoint } | null>(null);

  const geo = useMemo(() => {
    const pts = history.map((p) => ({ ...p, t: new Date(p.date).getTime() }));
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const span = t1 - t0 || 1;
    const maxVal = Math.max(...pts.map((p) => p.value));
    const yMax = Math.ceil((maxVal * 1.05) / 100) * 100;
    const x = (t: number) => M.left + ((t - t0) / span) * PLOT_W;
    const y = (v: number) => M.top + PLOT_H - (v / yMax) * PLOT_H;
    const xy = pts.map((p) => ({ ...p, cx: x(p.t), cy: y(p.value) }));
    const line = xy.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(" ");
    const area = `${line} L${xy[xy.length - 1].cx.toFixed(1)} ${(M.top + PLOT_H).toFixed(1)} L${xy[0].cx.toFixed(1)} ${(M.top + PLOT_H).toFixed(1)} Z`;

    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += yMax >= 1500 ? 500 : 250) yTicks.push(v);

    const yearStart = new Date(pts[0].date).getFullYear();
    const yearEnd = new Date(pts[pts.length - 1].date).getFullYear();
    const totalYears = yearEnd - yearStart;
    const step = totalYears > 18 ? 4 : totalYears > 10 ? 3 : totalYears > 5 ? 2 : 1;
    const xTicks: { x: number; label: number }[] = [];
    for (let yr = yearStart; yr <= yearEnd; yr += step) {
      xTicks.push({ x: x(new Date(`${yr}-01-01`).getTime()), label: yr });
    }
    return { xy, line, area, yTicks, xTicks, yMax };
  }, [history]);

  function onMove(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vbX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * W;
    let best = geo.xy[0];
    for (const p of geo.xy) if (Math.abs(p.cx - vbX) < Math.abs(best.cx - vbX)) best = p;
    setHover({ x: best.cx, p: best });
  }

  return (
    <section id="review-growth" className="glass rounded-2xl p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
          How ₹100 would have grown
        </h2>
        <span className="rounded-full border border-line px-2.5 py-1 text-[10px] text-ink-faint">
          real NAV · to {data.as_of}
        </span>
      </div>
      <p className="mb-4 text-xs text-ink-faint">
        The fund&apos;s actual past, over {data.history_years} years — ₹100 at the start became{" "}
        <span className="font-semibold text-ink">{inr(stats.growth_multiple * 100)}</span>.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="₹100 became" value={inr(stats.growth_multiple * 100)} />
        <Stat label="Per-year since start" value={`${pct(stats.cagr_since_inception)}/yr`} />
        <Stat label="Last 5 years" value={`${pct(stats.cagr_5y)}/yr`} />
        <Stat label="Worst fall" value={pct(stats.worst_drawdown, 0)} tone="caution" />
      </div>

      <div ref={containerRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Growth of ₹100 in ${data.scheme_name} over ${data.history_years} years became ${inr(stats.growth_multiple * 100)}.`}
        >
          {geo.yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={M.top + PLOT_H - (v / geo.yMax) * PLOT_H} y2={M.top + PLOT_H - (v / geo.yMax) * PLOT_H} stroke="var(--line)" strokeWidth={1} />
              <text x={M.left - 8} y={M.top + PLOT_H - (v / geo.yMax) * PLOT_H + 3} textAnchor="end" className="fill-[var(--ink-faint)]" fontSize={11}>
                {v === 0 ? "₹0" : inr(v)}
              </text>
            </g>
          ))}
          {geo.xTicks.map((t) => (
            <text key={t.label} x={t.x} y={H - 12} textAnchor="middle" className="fill-[var(--ink-faint)]" fontSize={11}>
              {t.label}
            </text>
          ))}
          <path d={geo.area} fill={LINE} opacity={0.07} />
          <path d={geo.line} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
          {hover && (
            <>
              <line x1={hover.x} x2={hover.x} y1={M.top} y2={M.top + PLOT_H} stroke="var(--ink-faint)" strokeWidth={1} opacity={0.5} />
              <circle cx={hover.x} cy={M.top + PLOT_H - (hover.p.value / geo.yMax) * PLOT_H} r={3.5} fill={LINE} />
            </>
          )}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[7rem] -translate-x-1/2 rounded-xl border border-line bg-bg-elev px-3 py-2 shadow-sm"
            style={{ left: `${Math.min(88, Math.max(12, (hover.x / W) * 100))}%` }}
          >
            <div className="text-[10px] uppercase tracking-wider text-ink-faint">
              {new Date(hover.p.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            </div>
            <div className="font-mono text-sm font-semibold text-ink">{inr(hover.p.value)}</div>
            <div className="text-[10px] text-ink-faint">per ₹100 at the start</div>
          </div>
        )}
      </div>

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
