'use client';

import { useEffect, useRef, useState } from 'react';

export type BarSegment = {
  key: string;
  label: string;
  value: number;
  /** Tailwind background class(es) for the block, light and dark. */
  fill: string;
  /** Text class for the share printed on the block — white or near-black,
   * whichever reads on that fill (chosen per fill, per theme). */
  ink: string;
};

/** Rough width of a share label like "46%" at 11px bold, plus padding — a
 * block narrower than this prints nothing rather than a clipped number. */
const labelWidth = (text: string) => text.length * 7 + 12;

/** One whole split into ordered parts — e.g. what customers owe, by how
 * late it is. A single 28px bar of blocks separated by 2px of surface, each
 * block's share printed on it where it fits (measured against the bar's
 * real width, not guessed), with a legend underneath giving each part's
 * name and amount in block order. Hover, tap or focus a block for its
 * figures. Parts at zero draw nothing but stay in the legend so the scale
 * reads the same every time. */
export function SegmentedBar({ segments, format, label }: { segments: BarSegment[]; format: (n: number) => string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = segments.reduce((s, x) => s + Math.max(x.value, 0), 0);
  const visible = segments.filter((s) => s.value > 0.004);
  const usable = Math.max(0, width - (visible.length - 1) * 2);
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  const hovered = segments.find((s) => s.key === active);

  return (
    <div className="relative">
      <div ref={ref} className="flex h-7 w-full gap-[2px]" role="list" aria-label={label} onMouseLeave={() => setActive(null)}>
        {total <= 0.004 ? (
          <div className="h-full w-full rounded-[4px] bg-surface-alt" />
        ) : (
          visible.map((s) => {
            const share = pct(s.value);
            const fits = (s.value / total) * usable >= labelWidth(share);
            return (
              <div
                key={s.key}
                role="listitem"
                tabIndex={0}
                aria-label={`${s.label}: ${format(s.value)}, ${share}`}
                onMouseEnter={() => setActive(s.key)}
                onFocus={() => setActive(s.key)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(s.key)}
                className={`flex h-full min-w-[3px] cursor-default items-center rounded-[4px] px-1.5 text-[11px] font-bold outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring ${s.fill} ${s.ink} ${
                  active && active !== s.key ? 'opacity-60' : ''
                }`}
                style={{ flex: `${s.value} 1 0%` }}
              >
                {fits && <span className="font-mono tabular-nums">{share}</span>}
              </div>
            );
          })
        )}
      </div>

      {hovered && total > 0.004 && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm2 bg-chrome px-2.5 py-1.5 text-[11px] text-white shadow-elevated">
          <span className="font-mono text-[12px] font-bold">{format(hovered.value)}</span>
          <span className="text-white/70">
            {' '}
            · {hovered.label} · {pct(hovered.value)}
          </span>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[11.5px]">
            <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-[3px] ${s.fill}`} aria-hidden />
            <span className="text-ink-soft">{s.label}</span>
            <span className="font-mono font-bold text-ink">{format(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
