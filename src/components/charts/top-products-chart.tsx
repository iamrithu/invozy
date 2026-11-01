import { fmtInr } from '@/lib/gst';
import type { TopProduct, TopProducts } from '@/actions/reports';

export type TopProductsRank = 'value' | 'qty';

/** Horizontal bar list — best sellers, by sales value or by quantity in
 * main units ("12 Box + 4 Pc"; see TopProductsToggle). Bar length is
 * proportional to the top item. Compact by design (fixed-height rows, no
 * axis chrome) so it sits comfortably beside the status breakdown without
 * pushing the page tall. */
export function TopProductsChart({ data, by, currency }: { data: TopProducts; by: TopProductsRank; currency?: string }) {
  const list: TopProduct[] = by === 'value' ? data.byValue : data.byQty;

  if (data.byValue.length === 0) {
    return <p className="py-8 text-center text-[12.5px] text-ink-faint">No products billed in this period.</p>;
  }
  const metric = (d: TopProduct) => (by === 'value' ? d.revenue : d.qty);
  const max = Math.max(...list.map(metric), 1);

  return (
    <div className="space-y-2">
      {list.map((d) => (
        <div key={d.key} className="text-[12px]">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-semibold text-ink-soft">
              {d.name}
              <span className="font-normal text-ink-faint"> · {by === 'value' ? d.qtyLabel : fmtInr(d.revenue, currency)}</span>
            </span>
            <span className="flex-shrink-0 font-mono font-bold text-ink">{by === 'value' ? fmtInr(d.revenue, currency) : d.qtyLabel}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
            <div className={`h-full rounded-full ${by === 'value' ? 'bg-brand' : 'bg-gold'}`} style={{ width: `${Math.max((metric(d) / max) * 100, 3)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Value | Quantity switch for the Top products card's header. */
export function TopProductsToggle({ by, onChange }: { by: TopProductsRank; onChange: (by: TopProductsRank) => void }) {
  return (
    <div className="inline-flex rounded-sm2 bg-surface-alt p-0.5 text-[11px] font-bold" role="radiogroup" aria-label="Rank products by">
      {(['value', 'qty'] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={by === k}
          onClick={() => onChange(k)}
          className={`rounded-sm2 px-2 py-0.5 transition-colors ${by === k ? 'bg-surface text-ink shadow-card' : 'text-ink-faint hover:text-ink'}`}
        >
          {k === 'value' ? 'Value' : 'Quantity'}
        </button>
      ))}
    </div>
  );
}
