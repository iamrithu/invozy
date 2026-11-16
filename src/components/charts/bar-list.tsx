import Link from 'next/link';

export type BarListItem = {
  key: string;
  label: string;
  /** Muted text after the label ("12 products", "4 Box + 6 Pc"). */
  sub?: string;
  value: number;
  /** The figure printed at the row's end, already formatted. */
  valueLabel: string;
  /** Muted text after the figure ("38%"). */
  note?: string;
  href?: string;
};

/** Ranked horizontal bars — one row per part, largest first, every bar the
 * same hue (the parts are names, not an ordered scale) and its length
 * proportional to the top row. The figures sit in text at each row's end,
 * so the bars only carry the comparison and nothing hides behind hover.
 * Generalises TopProductsChart for any ranked list on the Reports tabs. */
export function BarList({ items, barClassName = 'bg-brand', emptyText = 'Nothing to show for this period.' }: { items: BarListItem[]; barClassName?: string; emptyText?: string }) {
  if (items.length === 0) return <p className="py-8 text-center text-[12.5px] text-ink-faint">{emptyText}</p>;
  const max = Math.max(...items.map((d) => d.value), 1e-9);

  return (
    <ul className="space-y-2.5">
      {items.map((d) => (
        <li key={d.key} className="text-[12px]">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-semibold text-ink-soft">
              {d.href ? (
                <Link href={d.href} className="hover:text-brand hover:underline">
                  {d.label}
                </Link>
              ) : (
                d.label
              )}
              {d.sub && <span className="font-normal text-ink-faint"> · {d.sub}</span>}
            </span>
            <span className="flex-shrink-0 font-mono font-bold text-ink">
              {d.valueLabel}
              {d.note && <span className="ml-1.5 text-[11px] font-semibold text-ink-faint">{d.note}</span>}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-alt">
            <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${Math.max((Math.max(d.value, 0) / max) * 100, d.value > 0 ? 2 : 0)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The thin bar inside a table cell — a row's share against the largest
 * row, so a long sortable table still reads as a ranking at a glance. */
export function InlineBar({ value, max, className = 'bg-brand' }: { value: number; max: number; className?: string }) {
  const w = max > 0 ? Math.max((Math.max(value, 0) / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-1 w-full min-w-[48px] rounded-full bg-surface-alt" aria-hidden>
      <div className={`h-full rounded-full ${className}`} style={{ width: `${w}%` }} />
    </div>
  );
}
