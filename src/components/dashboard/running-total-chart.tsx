'use client';

import { useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { fmtInr } from '@/lib/gst';
import { fmtMoneyWhole } from '@/components/reports/format';
import { cn } from '@/lib/utils';

type Point = { date: string; total: number };

const W = 640;
const H = 210;
const PAD_L = 70; // room for full ₹ axis labels
const PAD_R = 80; // and for the end labels
const PAD_T = 14;
const PAD_B = 24;

const CURRENT = 'hsl(var(--chart-sales))';
const PREVIOUS = 'hsl(var(--ink-faint))';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return [0, step, step * 2, step * 3, step * 4];
}

/** Running total of sales through the period against the same days of the
 * period before, day by day — one look says whether you're ahead or behind,
 * and since when. Solid line = this period, dashed = the comparison; both
 * end-labelled, with a crosshair tooltip (hover, tap or arrow keys). A
 * one-day period has no line to draw, so it compares the two days as bars. */
export function RunningTotalChart({
  current,
  previous,
  currency,
  previousName,
  compare = true,
}: {
  current: Point[];
  previous: Point[];
  currency: string;
  /** "the same days of October" — what the dashed line is. */
  previousName: string;
  /** False (All time): just this period's line — no badge, no dashed line. */
  compare?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const now = current[current.length - 1]?.total ?? 0;
  const then = previous[previous.length - 1]?.total ?? 0;
  const diff = now - then;
  const pct = then > 0.004 ? (diff / then) * 100 : null;
  const dir = Math.abs(diff) < 0.5 ? 'flat' : diff > 0 ? 'up' : 'down';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  const money = (n: number) => fmtInr(n, currency);
  const whole = (n: number) => fmtMoneyWhole(n, currency);

  const headline = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono text-[22px] font-bold leading-tight text-ink">{money(now)}</span>
      {compare && (
      <span
        className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold',
          dir === 'up' ? 'bg-green-soft text-green' : dir === 'down' ? 'bg-red-soft text-red' : 'bg-surface-alt text-ink-soft'
        )}
      >
        <Icon size={12} />
        {dir === 'flat' ? 'Level with' : `${money(Math.abs(diff))} ${dir === 'up' ? 'ahead of' : 'behind'}`} {previousName}
        {pct !== null && dir !== 'flat' && <span className="font-mono">({pct > 0 ? '+' : ''}{pct.toFixed(0)}%)</span>}
      </span>
      )}
    </div>
  );

  // One day: nothing to draw a line through — compare the two totals.
  if (current.length < 2) {
    const max = Math.max(now, then, 1);
    return (
      <div>
        {headline}
        <ul className="mt-4 space-y-3">
          {[
            { label: current[0] ? dm(current[0].date) : 'This period', value: now, color: CURRENT },
            ...(compare ? [{ label: previous[0] ? dm(previous[0].date) : 'Before', value: then, color: PREVIOUS }] : []),
          ].map((r) => (
            <li key={r.label} className="text-[12px]">
              <div className="mb-1 flex justify-between gap-2">
                <span className="font-semibold text-ink-soft">{r.label}</span>
                <span className="font-mono font-bold text-ink">{fmtInr(r.value, currency)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-alt">
                <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const n = Math.max(current.length, previous.length);
  const ticks = niceTicks(Math.max(now, then, ...current.map((p) => p.total), ...previous.map((p) => p.total)));
  const top = ticks[ticks.length - 1] || 1;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (n > 1 ? (i / (n - 1)) * plotW : 0);
  const y = (v: number) => PAD_T + plotH - (v / top) * plotH;
  const path = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const area = `${path(current)} L${x(current.length - 1).toFixed(1)},${PAD_T + plotH} L${x(0).toFixed(1)},${PAD_T + plotH} Z`;
  const hasData = now > 0.004 || then > 0.004;

  // End labels, nudged apart when the two lines finish close together.
  let yNow = y(now);
  let yThen = y(then);
  if (Math.abs(yNow - yThen) < 14) {
    const mid = (yNow + yThen) / 2;
    yNow = now >= then ? mid - 7 : mid + 7;
    yThen = now >= then ? mid + 7 : mid - 7;
  }
  const xLabels = [0, Math.floor((current.length - 1) / 2), current.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  function pick(clientX: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD_L) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const h = hover;
  const cur = h !== null ? current[h] : undefined;
  const prev = h !== null ? previous[h] : undefined;

  return (
    <div>
      {headline}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11.5px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: CURRENT }} /> This period
        </span>
        {compare && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: PREVIOUS }} /> {previousName.replace(/^the /, 'The ')}
          </span>
        )}
      </div>
      {!hasData ? (
        <div className="mt-2 flex h-[160px] items-center justify-center rounded-lg2 border border-dashed border-line text-[12px] text-ink-faint">
          No issued invoices in either period yet.
        </div>
      ) : (
        <div className="relative mt-1">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
            role="img"
            tabIndex={0}
            aria-label={`Running total: ${fmtInr(now, currency)} this period against ${fmtInr(then, currency)} for ${previousName}. Use the arrow keys to step through the days.`}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setHover((v) => Math.min(n - 1, (v ?? -1) + 1));
              else if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? n) - 1));
              else return;
              e.preventDefault();
            }}
          >
            <defs>
              <linearGradient id="rt-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={CURRENT} stopOpacity={0.18} />
                <stop offset="100%" stopColor={CURRENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="hsl(var(--line))" strokeWidth={1} />
                <text x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint font-mono text-[10px]">
                  {whole(t)}
                </text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === current.length - 1 ? 'end' : 'middle'} className="fill-ink-faint text-[10.5px]">
                {dm(current[i].date)}
              </text>
            ))}
            <path d={area} fill="url(#rt-fill)" />
            {previous.length > 1 && <path d={path(previous)} fill="none" stroke={PREVIOUS} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />}
            <path d={path(current)} fill="none" stroke={CURRENT} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(current.length - 1)} cy={y(now)} r={3.5} fill={CURRENT} stroke="hsl(var(--surface))" strokeWidth={2} />
            {previous.length > 0 && <circle cx={x(previous.length - 1)} cy={y(then)} r={3} fill={PREVIOUS} stroke="hsl(var(--surface))" strokeWidth={2} />}
            <text x={x(current.length - 1) + 8} y={yNow} dy="0.32em" className="fill-ink font-mono text-[11px] font-bold">
              {whole(now)}
            </text>
            {previous.length > 0 && (
              <text x={x(previous.length - 1) + 8} y={yThen} dy="0.32em" className="fill-ink-faint font-mono text-[11px] font-semibold">
                {whole(then)}
              </text>
            )}
            {h !== null && (
              <g pointerEvents="none">
                <line x1={x(h)} x2={x(h)} y1={PAD_T} y2={PAD_T + plotH} stroke="hsl(var(--ink-faint))" strokeWidth={1} />
                {cur && <circle cx={x(h)} cy={y(cur.total)} r={4} fill={CURRENT} stroke="hsl(var(--surface))" strokeWidth={2} />}
                {prev && <circle cx={x(h)} cy={y(prev.total)} r={4} fill={PREVIOUS} stroke="hsl(var(--surface))" strokeWidth={2} />}
              </g>
            )}
          </svg>
          {h !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-[190px] rounded-lg2 border border-line bg-surface px-3 py-2 text-[11.5px] shadow-elevated"
              style={{ left: `${(x(h) / W) * 100}%`, transform: `translateX(${h < n * 0.25 ? '0%' : h > n * 0.75 ? '-100%' : '-50%'})` }}
            >
              <div className="mb-1 font-bold text-ink">Day {h + 1}</div>
              <TipRow color={CURRENT} label={cur ? dm(cur.date) : '—'} value={cur ? fmtInr(cur.total, currency) : '—'} />
              <TipRow color={PREVIOUS} label={prev ? dm(prev.date) : '—'} value={prev ? fmtInr(prev.total, currency) : '—'} dashed />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TipRow({ color, label, value, dashed }: { color: string; label: string; value: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-3', dashed ? 'border-t-2 border-dashed' : 'h-0.5 rounded-full')} style={dashed ? { borderColor: color } : { background: color }} />
      <span className="text-ink-soft">{label}</span>
      <span className="ml-auto font-mono font-bold text-ink">{value}</span>
    </div>
  );
}
