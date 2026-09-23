import { fmtInr } from '@/lib/gst';
import type { TopProduct } from '@/actions/reports';

/** Horizontal bar list — best-selling line items by revenue, bar length
 * proportional to the top item's revenue. Compact by design (fixed-height
 * rows, no axis chrome) so it sits comfortably beside the status breakdown
 * without pushing the page tall. */
export function TopProductsChart({ data, currency }: { data: TopProduct[]; currency?: string }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-[12.5px] text-ink-faint">No products billed in this period.</p>;
  }
  const max = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.key} className="text-[12px]">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-semibold text-ink-soft">{d.name}</span>
            <span className="flex-shrink-0 font-mono font-bold text-ink">{fmtInr(d.revenue, currency)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max((d.revenue / max) * 100, 3)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
