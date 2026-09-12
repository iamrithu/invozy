'use client';

import { useState } from 'react';
import { fmtInr } from '@/lib/gst';

export function BillingTrendChart({ data }: { data: { month: string; total: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.total), 1);
  const barW = 24;
  const gap = 18;
  const w = data.length * (barW + gap) + gap;
  const h = 170;
  const baseline = 138;
  const plotH = 100;

  if (data.every((d) => d.total === 0)) {
    return <p className="py-10 text-center text-[12.5px] text-ink-faint">No billing data in the last {data.length} months yet.</p>;
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={0} y1={baseline} x2={w} y2={baseline} stroke="hsl(var(--line))" strokeWidth={1} />
        {data.map((d, i) => {
          const x = gap + i * (barW + gap);
          const barH = Math.max((d.total / max) * plotH, d.total > 0 ? 3 : 0);
          const y = baseline - barH;
          const label = new Date(d.month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' });
          const isLast = i === data.length - 1;
          const active = hover === i;
          return (
            <g key={d.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
              <rect x={x} y={y} width={barW} height={barH} rx={4} fill={d.total > 0 ? 'hsl(var(--brand))' : 'hsl(var(--surface-alt))'} opacity={active ? 0.75 : 1} />
              <rect x={x} y={0} width={barW} height={h} fill="transparent" />
              <text x={x + barW / 2} y={baseline + 18} textAnchor="middle" fontSize="11" fill="hsl(var(--ink-faint))" fontWeight={600}>
                {label}
              </text>
              {(isLast || active) && d.total > 0 && (
                <text x={x + barW / 2} y={Math.max(y - 8, 12)} textAnchor="middle" fontSize="11" fill="hsl(var(--ink))" fontWeight={700} fontFamily="var(--font-ibm-plex-mono)">
                  {d.total >= 1000 ? (d.total / 1000).toFixed(1) + 'k' : Math.round(d.total)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-sm2 bg-chrome px-2.5 py-1.5 text-[11px] font-bold text-white shadow-elevated">
          {new Date(data[hover].month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} · {fmtInr(data[hover].total)}
        </div>
      )}
    </div>
  );
}
