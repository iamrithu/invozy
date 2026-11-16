'use client';

import { useState } from 'react';

export type ColumnPoint = {
  key: string;
  label: string;
  value: number;
  /** Extra tooltip line under the value ("4 invoices · 2 Tuesdays"). */
  detail?: string;
};

/** Clean axis steps — 1, 2, 2.5 or 5 × a power of ten — so ticks read as
 * round numbers (0 / 25K / 50K) instead of whatever max ÷ 3 happens to be. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

const PLOT_H = 140;

/** One series as vertical columns over a shared baseline — sales by
 * weekday, money collected per day or month. Plain HTML rather than SVG so
 * the 4px rounded column tops stay crisp at any width (a stretched SVG
 * viewBox would squash them), columns capped at 24px wide with the rest of
 * each slot left as air, hairline gridlines at three round ticks, and the
 * tallest column labelled directly. Hover, tap or keyboard focus on a
 * column shows its value in a tooltip; a screen-reader table carries every
 * value without either. `color` is a Tailwind background class so the
 * caller picks the series hue from the app's own tokens. */
export function ColumnChart({
  data,
  format,
  formatAxis = format,
  color = 'bg-brand',
  emptyText = 'Nothing in the selected period.',
  label,
}: {
  data: ColumnPoint[];
  format: (n: number) => string;
  formatAxis?: (n: number) => string;
  color?: string;
  emptyText?: string;
  /** What the chart shows — its accessible name and table caption. */
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (data.length === 0 || data.every((d) => d.value <= 0)) {
    return <p className="py-10 text-center text-[12.5px] text-ink-faint">{emptyText}</p>;
  }

  const peak = Math.max(...data.map((d) => d.value));
  const step = niceStep(peak / 3);
  const top = Math.max(step * Math.ceil(peak / step), step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const peakIndex = data.findIndex((d) => d.value === peak);
  // Thin the x labels on long runs (31 days) so they don't smear together;
  // the first and last always show.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const n = data.length;
  const hovered = active !== null ? data[active] : null;

  return (
    <div className="relative" onMouseLeave={() => setActive(null)}>
      <div className="flex">
        <div className="relative w-[68px] flex-shrink-0" style={{ height: PLOT_H }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 translate-y-1/2 whitespace-nowrap font-mono text-[10px] tabular-nums text-ink-faint" style={{ bottom: `${(t / top) * 100}%` }}>
              {formatAxis(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => {
              const h = (d.value / top) * 100;
              return (
                <button
                  key={d.key}
                  type="button"
                  className="relative flex h-full min-w-0 flex-1 items-end justify-center rounded-sm2 focus:outline-none focus-visible:bg-surface-alt"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(i)}
                  aria-label={`${d.label}: ${format(d.value)}${d.detail ? `, ${d.detail}` : ''}`}
                >
                  {i === peakIndex && active === null && (
                    <span
                      className="pointer-events-none absolute whitespace-nowrap font-mono text-[10.5px] font-bold text-ink-soft"
                      style={{ bottom: `calc(${h}% + 3px)` }}
                      aria-hidden
                    >
                      {formatAxis(d.value)}
                    </span>
                  )}
                  <span
                    className={`block w-full max-w-[24px] rounded-t-[4px] transition-opacity ${color} ${active !== null && active !== i ? 'opacity-45' : ''}`}
                    style={{ height: `${h}%`, minHeight: d.value > 0 ? 2 : 0 }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ml-11 flex gap-[2px] pt-1.5" aria-hidden>
        {data.map((d, i) => {
          // A regular tick within one step of the always-shown last label
          // would collide with it, so those are skipped.
          const show = i === 0 || i === n - 1 || i === active || (i % labelEvery === 0 && i <= n - 1 - labelEvery);
          const edge = i === 0 ? 'left-0' : i === n - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2';
          return (
            <div key={d.key} className="relative h-4 min-w-0 flex-1">
              {show && <span className={`absolute top-0 whitespace-nowrap text-[10.5px] font-semibold ${i === active ? 'text-ink' : 'text-ink-faint'} ${edge}`}>{d.label}</span>}
            </div>
          );
        })}
      </div>

      {hovered && active !== null && (
        <div
          className={`pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-sm2 bg-chrome px-2.5 py-1.5 text-[11px] text-white shadow-elevated ${
            active / n < 0.2 ? '' : active / n > 0.8 ? '-translate-x-full' : '-translate-x-1/2'
          }`}
          style={{ left: `calc(2.75rem + (100% - 2.75rem) * ${(active + 0.5) / n})` }}
        >
          <div className="font-mono text-[12px] font-bold">{format(hovered.value)}</div>
          <div className="text-white/70">
            {hovered.label}
            {hovered.detail ? ` · ${hovered.detail}` : ''}
          </div>
        </div>
      )}

      {/* A div, not the table itself, carries sr-only: a table won't shrink
          below its content width, so it would widen the page on a phone. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.label}</th>
                <td>{format(d.value)}</td>
                {d.detail && <td>{d.detail}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
