'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, TrendingDown, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// The small building blocks every Reports tab is made of — one card, one
// stat tile, one growth badge, one sortable header — so the five tabs look
// like one page rather than five.

/** A titled card. `sub` is a one-line caption under the title saying what
 * the figures cover ("As of today", "Last 30 days' sales rate"). */
export function ReportCard({
  icon,
  title,
  sub,
  action,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0 rounded-xl2 border border-line bg-surface p-3 shadow-card', className)}>
      <div className="mb-2.5 flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-ink">
            {icon} {title}
          </h2>
          {sub && <p className="mt-0.5 text-[11px] text-ink-faint">{sub}</p>}
        </div>
        {action && <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** One headline figure — the same tile the Overview's KPI row has always
 * used, with an optional change badge and a muted line under the label. */
export function StatTile({
  icon,
  label,
  value,
  sub,
  badge,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
  tone?: 'red' | 'green';
}) {
  return (
    <div className="min-w-0 rounded-lg2 border border-line bg-surface p-2.5 shadow-card transition-colors hover:border-brand/50">
      <div className="flex items-center justify-between gap-2">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">{icon}</div>
        {badge}
      </div>
      <div className={cn('mt-1.5 truncate font-mono text-[15px] font-extrabold', tone === 'red' ? 'text-red' : tone === 'green' ? 'text-green' : 'text-ink')}>{value}</div>
      <div className="mt-0.5 text-[10.5px] text-ink-faint">{label}</div>
      {sub && <div className="mt-0.5 truncate text-[10.5px] text-ink-faint">{sub}</div>}
    </div>
  );
}

/** % change vs the previous equivalent period — hidden when there's no
 * previous figure to compare against (an open-ended range like "All time"
 * has no "period before all of history") or the previous period had
 * nothing (a from-zero "+∞%" reads as noise, not signal). Green means good:
 * pass `upIsGood={false}` for figures where growth is bad news (money
 * still outstanding). */
export function ChangeBadge({ current, previous, upIsGood = true }: { current: number; previous?: number | null; upIsGood?: boolean }) {
  if (previous === undefined || previous === null || previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct > 0.5;
  const down = pct < -0.5;
  if (!up && !down) return null;
  const good = up === upIsGood;
  return (
    <span className={`flex items-center gap-0.5 text-[10.5px] font-extrabold ${good ? 'text-green' : 'text-red'}`} title="vs the previous period of the same length">
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/** A table cell's growth figure: ▲ 12% (green), ▼ 5% (red), "New" when
 * there was nothing to grow from, "—" with no comparison period. The arrow
 * carries the direction, so it never relies on colour alone. */
export function Growth({ growth, isNew }: { growth: number | null; isNew?: boolean }) {
  if (isNew) return <span className="text-[11px] font-extrabold text-green">New</span>;
  if (growth === null) return <span className="text-ink-faint">—</span>;
  const pct = growth * 100;
  if (Math.abs(pct) < 0.5) return <span className="font-mono text-ink-faint">0%</span>;
  return (
    <span className={`whitespace-nowrap font-mono font-bold ${pct > 0 ? 'text-green' : 'text-red'}`}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)).toLocaleString('en-IN') : Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export type SortState<K extends string> = { key: K; dir: 'asc' | 'desc' };

/** Client-side sorting for a loaded table. Clicking a new column sorts it
 * descending first (biggest numbers on top is what a report reader wants);
 * text columns pass `firstDir: 'asc'`. Nulls always sink to the bottom. */
export function useSortedRows<T, K extends string>(rows: T[], initial: SortState<K>, value: (row: T, key: K) => number | string | null) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = value(a, sort.key);
      const vb = value(b, sort.key);
      if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
    // `value` is a pure accessor; re-sorting on its identity would re-run
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: K, firstDir: 'asc' | 'desc' = 'desc') =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir }));
  return { sorted, sort, toggle };
}

/** A header cell that sorts its column — the arrow shows which column and
 * which way, and `aria-sort` says the same to a screen reader. */
export function SortHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  firstDir,
  className,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K, firstDir?: 'asc' | 'desc') => void;
  align?: 'left' | 'right';
  firstDir?: 'asc' | 'desc';
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={cn('whitespace-nowrap', align === 'right' && 'text-right', className)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey, firstDir)}
        className={cn('inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-ink', active && 'text-ink', align === 'right' && 'flex-row-reverse')}
      >
        {label}
        <Icon size={11} className={active ? 'opacity-100' : 'opacity-40'} />
      </button>
    </TableHead>
  );
}

/** A small segmented switch (Customer | Product | Category, 30 | 60 | 90
 * days…) — the same look as the Overview's Value | Quantity toggle. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-sm2 bg-surface-alt p-0.5 text-[11.5px] font-bold" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-sm2 px-2.5 py-1 transition-colors ${value === o.value ? 'bg-surface text-ink shadow-card' : 'text-ink-faint hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** What a card or tab shows when its period has nothing in it — an icon,
 * one plain sentence, and optionally the way to fix it. */
export function EmptyState({ icon, children, action }: { icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-alt text-ink-faint">{icon}</div>}
      <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-faint">{children}</p>
      {action}
    </div>
  );
}

/** Dims a tab's content while the next filter's figures load, keeping the
 * previous ones in place instead of flashing skeletons (see the hooks'
 * `placeholderData`). */
export function Refreshing({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('transition-opacity', busy && 'pointer-events-none opacity-60')} aria-busy={busy}>
      {children}
    </div>
  );
}

// ---- skeletons -------------------------------------------------------------

export function TilesSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 md:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg2 border border-line bg-surface p-2.5 shadow-card">
          <Skeleton className="h-6 w-6 rounded-sm2" />
          <Skeleton className="mt-2 h-4 w-20" />
          <Skeleton className="mt-1.5 h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ chart = false, rows = 5, className }: { chart?: boolean; rows?: number; className?: string }) {
  return (
    <div className={cn('rounded-xl2 border border-line bg-surface p-3 shadow-card', className)}>
      <Skeleton className="mb-3 h-3.5 w-40" />
      {chart && <Skeleton className="mb-3 h-[150px] w-full" />}
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-full" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg2 border border-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line p-3 last:border-0">
          <Skeleton className="h-3 flex-1" />
          {Array.from({ length: cols - 1 }).map((__, j) => (
            <Skeleton key={j} className="h-3 w-16" />
          ))}
        </div>
      ))}
    </div>
  );
}
