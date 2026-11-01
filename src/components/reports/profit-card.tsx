import { Info } from 'lucide-react';
import { fmtInr } from '@/lib/gst';
import type { ProfitEstimate } from '@/actions/reports';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Gross profit estimate: net sales − cost of goods at each product's
 * average purchase cost (see getProfitEstimate). Products without a cost
 * on file are left out of the profit figure rather than treated as free,
 * and the card says how much of the period's sales that covers — with the
 * fix ("add purchase entries") right there. */
export function ProfitCard({ data, currency }: { data: ProfitEstimate; currency?: string }) {
  const money = (n: number) => fmtInr(n, currency);

  if (data.revenue <= 0.004 && data.top.length === 0) {
    return <p className="py-8 text-center text-[12.5px] text-ink-faint">No sales in this period.</p>;
  }

  const noCostAtAll = data.knownRevenue <= 0.004;
  const maxProfit = Math.max(...data.top.map((r) => Math.abs(r.profit)), 1);

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Figure label="Net sales" value={money(data.revenue)} />
        <Figure label="Cost of goods" value={noCostAtAll ? '—' : money(data.cost)} />
        <Figure
          label="Est. gross profit"
          value={noCostAtAll ? '—' : money(data.profit)}
          sub={data.margin !== null ? `${pct(data.margin)} margin` : undefined}
          tone={data.profit < 0 ? 'red' : 'green'}
        />
      </div>

      {data.unknown.products > 0 && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-sm2 bg-gold-soft px-2.5 py-1.5 text-[11.5px] leading-snug text-ink-body">
          <Info size={13} className="mt-px flex-shrink-0 text-gold" />
          <span>
            Cost unknown for {data.unknown.products} product{data.unknown.products === 1 ? '' : 's'} ({pct(data.unknown.share)} of sales) — add purchase entries to see
            their profit.
          </span>
        </p>
      )}

      {data.top.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            <span>Top products by profit</span>
            <span>Profit · margin</span>
          </div>
          <div className="space-y-2">
            {data.top.map((r) => (
              <div key={r.key} className="text-[12px]">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold text-ink-soft">
                    {r.name} <span className="font-normal text-ink-faint">· {r.qtyLabel}</span>
                  </span>
                  <span className="flex-shrink-0 font-mono font-bold text-ink">
                    {money(r.profit)} <span className={`text-[11px] ${r.margin < 0 ? 'text-red' : 'text-ink-faint'}`}>{pct(r.margin)}</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                  <div className={`h-full rounded-full ${r.profit < 0 ? 'bg-red' : 'bg-green'}`} style={{ width: `${Math.max((Math.abs(r.profit) / maxProfit) * 100, 3)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2.5 text-[10.5px] text-ink-faint">Estimate, before tax — sales after credit notes, at each product’s average purchase cost.</p>
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' }) {
  return (
    <div className="rounded-sm2 border border-line px-2.5 py-1.5">
      <div className="text-[10.5px] text-ink-faint">{label}</div>
      <div className={`font-mono text-[13.5px] font-extrabold ${tone === 'red' ? 'text-red' : tone === 'green' ? 'text-green' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-ink-faint">{sub}</div>}
    </div>
  );
}
