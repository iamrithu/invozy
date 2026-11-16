'use client';

import { useState } from 'react';
import { fmtInr } from '@/lib/gst';
import type { TrendPoint } from '@/actions/dashboard';

const W = 640;
const H = 220;
const PAD_L = 44;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 26;
const MAX_BAR = 22; // ≤ 24px per the chart spec — the band's leftover is air
const GAP = 2; // surface gap between a month's two columns

const SALES = 'hsl(var(--chart-sales))';
const COLLECTED = 'hsl(var(--chart-collected))';

/** ₹ in Indian short form for axis ticks: 45K, 1.2L, 2Cr. */
function compact(n: number) {
  if (n >= 1e7) return `${+(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${+(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

/** A "nice" axis maximum and 4 even ticks above zero. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return [0, step, step * 2, step * 3, step * 4];
}

function roundedTop(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Issued sales vs cash collected per day or month — paired columns on
 * one baseline, one axis, a hover tooltip per bucket. Bars narrow to fit a
 * month of days; labels thin out so at most about eight show. */
export function SalesCollectionsChart({ data, currency, granularity = 'month' }: { data: TrendPoint[]; currency: string; granularity?: 'day' | 'month' }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.flatMap((d) => [d.sales, d.collected]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const band = plotW / Math.max(data.length, 1);
  const BAR = Math.max(3, Math.min(MAX_BAR, (band - GAP - 8) / 2));
  const labelStep = Math.ceil(data.length / 8);
  const unit = granularity === 'day' ? 'day' : 'month';
  const y = (v: number) => PAD_T + plotH - (v / top) * plotH;
  const hasData = max > 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[11.5px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SALES }} /> Sales (issued invoices)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLLECTED }} /> Collected
        </span>
      </div>
      {!hasData ? (
        <div className="flex h-[180px] items-center justify-center rounded-lg2 border border-dashed border-line text-[12px] text-ink-faint">
          No issued invoices or payments in this period yet.
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Sales and collections by ${unit}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="hsl(var(--line))" strokeWidth={1} />
                <text x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint font-mono text-[10px]">
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD_L + band * i + band / 2;
              const x1 = cx - BAR - GAP / 2;
              const x2 = cx + GAP / 2;
              return (
                <g key={d.key}>
                  {hover === i && <rect x={PAD_L + band * i + 2} y={PAD_T} width={band - 4} height={plotH} rx={6} fill="hsl(var(--surface-alt))" />}
                  <path d={roundedTop(x1, y(d.sales), BAR, PAD_T + plotH - y(d.sales))} fill={SALES} />
                  <path d={roundedTop(x2, y(d.collected), BAR, PAD_T + plotH - y(d.collected))} fill={COLLECTED} />
                  {(data.length - 1 - i) % labelStep === 0 && (
                    <text x={cx} y={H - 8} textAnchor="middle" className={i === data.length - 1 ? 'fill-ink text-[10.5px] font-bold' : 'fill-ink-faint text-[10.5px]'}>
                      {d.label}
                    </text>
                  )}
                  {/* Hit target: the whole band, bigger than the marks. */}
                  <rect
                    x={PAD_L + band * i}
                    y={PAD_T}
                    width={band}
                    height={plotH + PAD_B}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    aria-label={`${d.label}: sales ${fmtInr(d.sales, currency)}, collected ${fmtInr(d.collected, currency)}`}
                  />
                </g>
              );
            })}
            <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="hsl(var(--ink-faint))" strokeWidth={1} />
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-[170px] -translate-x-1/2 rounded-lg2 border border-line bg-surface px-3 py-2 text-[11.5px] shadow-elevated"
              style={{ left: `${((PAD_L + band * hover + band / 2) / W) * 100}%` }}
            >
              <div className="mb-1 font-bold text-ink">{data[hover].label}</div>
              <TipRow color={SALES} label="Sales" value={fmtInr(data[hover].sales, currency)} />
              <TipRow color={COLLECTED} label="Collected" value={fmtInr(data[hover].collected, currency)} />
            </div>
          )}
          <table className="sr-only">
            <caption>Sales and collections by {unit}</caption>
            <thead>
              <tr>
                <th>{granularity === 'day' ? 'Day' : 'Month'}</th>
                <th>Sales</th>
                <th>Collected</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key}>
                  <td>{d.label}</td>
                  <td>{fmtInr(d.sales, currency)}</td>
                  <td>{fmtInr(d.collected, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
      <span className="text-ink-soft">{label}</span>
      <span className="ml-auto font-mono font-bold text-ink">{value}</span>
    </div>
  );
}
