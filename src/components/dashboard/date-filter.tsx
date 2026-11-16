'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { DASHBOARD_PRESETS, type DashboardPreset } from '@/lib/dashboard-period';
import { cn } from '@/lib/utils';

/** The dashboard's date filter: preset periods as links (so every view has
 * a shareable URL) and a Custom choice that opens a from–to pair. Mount it
 * with a `key` of the current range so the dates reset when the URL moves. */
export function DashboardDateFilter({ preset, from, to, today }: { preset: DashboardPreset; from: string; to: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(preset === 'custom');
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) return;
    const [a, b] = start <= end ? [start, end] : [end, start];
    router.push(`/dashboard?period=custom&from=${a}&to=${b}`, { scroll: false });
  }

  const pill = (active: boolean) =>
    cn('flex items-center gap-1 rounded-[4px] px-2.5 py-1.5 text-[12px] font-bold transition-colors', active ? 'bg-ink text-surface' : 'text-ink-soft hover:text-ink');

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:items-end">
      <nav aria-label="Dashboard dates" className="flex flex-wrap rounded-sm2 border border-line bg-surface p-0.5">
        {DASHBOARD_PRESETS.map((p) => (
          <Link
            key={p.id}
            href={p.id === 'month' ? '/dashboard' : `/dashboard?period=${p.id}`}
            scroll={false}
            onClick={() => setOpen(false)}
            aria-current={p.id === preset ? 'page' : undefined}
            className={pill(p.id === preset)}
          >
            {p.label}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-pressed={preset === 'custom'} className={pill(preset === 'custom')}>
          <CalendarRange size={12} /> Custom dates
        </button>
      </nav>
      {open && (
        <form onSubmit={apply} className="flex flex-wrap items-center gap-2 rounded-sm2 border border-line bg-surface px-2.5 py-1.5">
          <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft">
            From
            <input
              type="date"
              value={start}
              max={today}
              required
              onChange={(e) => setStart(e.target.value)}
              className="rounded-[4px] border border-line bg-bg px-1.5 py-1 font-mono text-[11.5px] text-ink-body outline-none focus:border-brand"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft">
            To
            <input
              type="date"
              value={end}
              min={start || undefined}
              max={today}
              required
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-[4px] border border-line bg-bg px-1.5 py-1 font-mono text-[11.5px] text-ink-body outline-none focus:border-brand"
            />
          </label>
          <button type="submit" disabled={!start || !end} className="rounded-[4px] bg-ink px-3 py-1.5 text-[11.5px] font-bold text-surface transition-opacity disabled:opacity-50">
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
