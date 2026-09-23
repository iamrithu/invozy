'use client';

import { useState } from 'react';
import { fmtInr } from '@/lib/gst';

export type TrendChartPoint = { key: string; label: string; billed: number; collected: number };

const VIEW_W = 600;
const VIEW_H = 170;
const BASELINE = 138;
const PLOT_H = 106;
const PAD_X = 6;

/** Two-series line/area chart — billed (brand, filled area) and collected
 * (green, line only) — over whatever buckets the server already decided on
 * (day or month; see getBillingTrend's doc comment). A fixed viewBox with
 * `preserveAspectRatio="none"` (rather than the old bar chart's viewBox
 * that widened with the point count) keeps the chart's rendered height
 * constant regardless of whether it's plotting 6 months or 31 days —
 * only the point spacing changes. This component does no date parsing of
 * its own, just draws `label` as given. */
export function BillingTrendChart({ data }: { data: TrendChartPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0 || data.every((d) => d.billed === 0 && d.collected === 0)) {
    return <p className="py-10 text-center text-[12.5px] text-ink-faint">No billing data in the selected period.</p>;
  }

  const max = Math.max(...data.map((d) => Math.max(d.billed, d.collected)), 1);
  const plotW = VIEW_W - PAD_X * 2;
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  const xAt = (i: number) => PAD_X + i * stepX;
  const yAt = (v: number) => BASELINE - (v / max) * PLOT_H;

  const linePath = (get: (d: TrendChartPoint) => number) => data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(get(d)).toFixed(1)}`).join(' ');
  const billedLine = linePath((d) => d.billed);
  const billedArea = `${billedLine} L ${xAt(data.length - 1).toFixed(1)} ${BASELINE} L ${xAt(0).toFixed(1)} ${BASELINE} Z`;
  const collectedLine = linePath((d) => d.collected);

  // Thin out x-axis labels once there are more than ~8 points (a 31-day
  // month view) so they don't overlap into an unreadable smear.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-4 text-[11px] font-bold">
        <span className="flex items-center gap-1.5 text-ink-soft">
          <span className="h-2 w-2 rounded-full" style={{ background: 'hsl(var(--brand))' }} /> Billed
        </span>
        <span className="flex items-center gap-1.5 text-ink-soft">
          <span className="h-2 w-2 rounded-full" style={{ background: 'hsl(var(--green))' }} /> Collected
        </span>
      </div>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="h-[150px] w-full">
        <line x1={0} y1={BASELINE} x2={VIEW_W} y2={BASELINE} stroke="hsl(var(--line))" strokeWidth={1} />
        <path d={billedArea} fill="hsl(var(--brand))" opacity={0.12} stroke="none" />
        <path d={billedLine} fill="none" stroke="hsl(var(--brand))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={collectedLine} fill="none" stroke="hsl(var(--green))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => {
          const active = hover === i;
          const isLast = i === data.length - 1;
          // The last point always gets a label, so a *regular*-interval tick
          // landing right next to it (e.g. day 22 next to day 23 of 23) would
          // otherwise overlap it — suppress a near-last regular tick instead.
          const showLabel = isLast || active || (i % labelEvery === 0 && i < data.length - 1 - Math.ceil(labelEvery / 2));
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
              <rect x={xAt(i) - stepX / 2} y={0} width={stepX || VIEW_W} height={VIEW_H} fill="transparent" />
              <circle cx={xAt(i)} cy={yAt(d.billed)} r={active ? 4 : 2.5} fill="hsl(var(--brand))" />
              <circle cx={xAt(i)} cy={yAt(d.collected)} r={active ? 4 : 2.5} fill="hsl(var(--green))" />
              {active && <line x1={xAt(i)} y1={0} x2={xAt(i)} y2={BASELINE} stroke="hsl(var(--ink-faint))" strokeWidth={1} strokeDasharray="2 2" />}
              {showLabel && (
                <text
                  x={xAt(i)}
                  y={BASELINE + 18}
                  // The first/last point sits flush against the viewBox's own
                  // edge (SVG clips anything outside it) — a centered label
                  // there would have half its text clipped off-screen, so
                  // those two anchor from their own edge instead of centering.
                  textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                  fontSize="11"
                  fill="hsl(var(--ink-faint))"
                  fontWeight={600}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap rounded-sm2 bg-chrome px-2.5 py-1.5 text-[11px] font-bold text-white shadow-elevated">
          {data[hover].label} · Billed {fmtInr(data[hover].billed)} · Collected {fmtInr(data[hover].collected)}
        </div>
      )}
    </div>
  );
}
