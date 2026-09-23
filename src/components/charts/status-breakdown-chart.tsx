import { fmtInr } from '@/lib/gst';
import { STATUS_COLOR } from '@/lib/report-status';
import type { StatusBreakdownPoint } from '@/actions/reports';

/** Compact single-bar breakdown — one horizontal bar split proportionally
 * (by billed total) into colored segments, one per status, with a legend
 * underneath giving the exact count/total per segment. Deliberately not a
 * donut/pie (already used for tax composition on this same page) — a
 * single stacked bar reads faster for "what fraction of billing is still
 * outstanding" and takes a fraction of the vertical space a second donut
 * would. */
export function StatusBreakdownChart({ data, currency }: { data: StatusBreakdownPoint[]; currency?: string }) {
  const grandTotal = data.reduce((s, d) => s + d.total, 0);

  if (data.length === 0 || grandTotal <= 0) {
    return <p className="py-8 text-center text-[12.5px] text-ink-faint">No invoices in this period.</p>;
  }

  return (
    <div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-surface-alt">
        {data.map((d) => (
          <div key={d.status} style={{ width: `${(d.total / grandTotal) * 100}%`, background: STATUS_COLOR[d.status] }} title={`${d.label}: ${fmtInr(d.total, currency)}`} />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {data.map((d) => (
          <div key={d.status} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm2" style={{ background: STATUS_COLOR[d.status] }} />
            <span className="flex-1 text-ink-soft">
              {d.label} <span className="text-ink-faint">· {d.count}</span>
            </span>
            <span className="font-mono font-bold text-ink">{fmtInr(d.total, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
