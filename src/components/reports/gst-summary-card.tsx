import { fmtInr } from '@/lib/gst';
import type { GstSummary, TaxHeads } from '@/actions/reports';

type Row = { label: string; hint?: string; heads: Omit<TaxHeads, 'count'>; tone?: 'minus' | 'total' | 'result' };

/** The period's GST position as a small GSTR-3B-shaped table: output tax
 * on invoices, less credit notes, less input tax on purchases — ending in
 * one plain answer, "Net GST payable" (or a credit to carry forward).
 * Per-head figures in the last row are output − input for that head; the
 * accountant's actual set-off (IGST credit first, etc.) can move tax
 * between heads, but the total is the same either way. */
export function GstSummaryCard({ data, currency }: { data: GstSummary; currency?: string }) {
  const money = (n: number) => fmtInr(n, currency);
  const sub = (a: Omit<TaxHeads, 'count'>, b: Omit<TaxHeads, 'count'>) => ({
    taxable: a.taxable - b.taxable,
    cgst: a.cgst - b.cgst,
    sgst: a.sgst - b.sgst,
    igst: a.igst - b.igst,
  });
  const tax = (h: Omit<TaxHeads, 'count' | 'taxable'>) => h.cgst + h.sgst + h.igst;

  const netOutput = sub(data.sales, data.returns);
  const rows: Row[] = [
    { label: 'Sales', hint: `${data.sales.count} invoice${data.sales.count === 1 ? '' : 's'}`, heads: data.sales },
    { label: 'Less: credit notes', hint: data.returns.count ? `${data.returns.count} note${data.returns.count === 1 ? '' : 's'}` : undefined, heads: data.returns, tone: 'minus' },
    { label: 'Net output tax', heads: netOutput, tone: 'total' },
  ];
  let payable: number | null = null;
  if (data.input) {
    rows.push({ label: 'Less: input tax', hint: `${data.input.count} bill${data.input.count === 1 ? '' : 's'}`, heads: data.input, tone: 'minus' });
    const net = sub(netOutput, data.input);
    rows.push({ label: 'Net GST', heads: net, tone: 'result' });
    payable = tax(net);
  }

  const nothing = data.sales.count === 0 && data.returns.count === 0 && (!data.input || data.input.count === 0);
  if (nothing) return <p className="py-8 text-center text-[12.5px] text-ink-faint">No invoices, credit notes or purchases in this period.</p>;

  const cell = (n: number, r: Row) => (
    <td className={`whitespace-nowrap px-2 py-1.5 text-right font-mono ${r.tone === 'result' && n < -0.004 ? 'text-green' : ''}`}>
      {/* "Less:" rows hold positive amounts shown as deductions; every other
          row shows its own sign (net output can go negative when returns
          exceed sales). */}
      {r.tone === 'minus' && n > 0.004 ? '−' : ''}
      {money(Math.abs(n) < 0.005 ? 0 : r.tone === 'minus' ? Math.abs(n) : n)}
    </td>
  );

  return (
    <div>
      {payable !== null && (
        <div className={`mb-3 flex items-baseline justify-between gap-3 rounded-lg2 px-3 py-2 ${payable > 0.004 ? 'bg-brand-light' : 'bg-green-soft'}`}>
          <span className="text-[12px] font-bold text-ink-body">{payable > 0.004 ? 'Net GST payable' : 'GST credit to carry forward'}</span>
          <span className={`font-mono text-[17px] font-extrabold ${payable > 0.004 ? 'text-brand-dark' : 'text-green'}`}>{money(Math.abs(payable))}</span>
        </div>
      )}

      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-wide text-ink-faint">
              <th className="px-2 py-1.5 text-left font-bold" />
              <th className="px-2 py-1.5 text-right font-bold">Taxable</th>
              <th className="px-2 py-1.5 text-right font-bold">CGST</th>
              <th className="px-2 py-1.5 text-right font-bold">SGST</th>
              <th className="px-2 py-1.5 text-right font-bold">IGST</th>
              <th className="px-2 py-1.5 text-right font-bold">Total tax</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className={`border-b border-line last:border-0 ${r.tone === 'total' || r.tone === 'result' ? 'font-bold text-ink' : 'text-ink-body'} ${r.tone === 'result' ? 'bg-surface-alt/60' : ''}`}
              >
                <td className="whitespace-nowrap px-2 py-1.5 text-left">
                  {r.label}
                  {r.hint && <span className="ml-1 text-[10.5px] font-normal text-ink-faint">· {r.hint}</span>}
                </td>
                {r.tone === 'result' ? <td className="px-2 py-1.5 text-right text-ink-faint">—</td> : cell(r.heads.taxable, r)}
                {cell(r.heads.cgst, r)}
                {cell(r.heads.sgst, r)}
                {cell(r.heads.igst, r)}
                {cell(tax(r.heads), r)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
        <Split label="B2B — buyer has GSTIN" value={money(data.b2b.taxable)} count={data.b2b.count} />
        <Split label="B2C — no GSTIN" value={money(data.b2c.taxable)} count={data.b2c.count} />
      </div>
      <p className="mt-2 text-[10.5px] text-ink-faint">
        {data.input
          ? 'All issued invoices in the period, paid or not. Negative figures in Net GST are credit.'
          : 'Input tax and net payable show only when no customer is selected — purchases aren’t per customer.'}
      </p>
    </div>
  );
}

function Split({ label, value, count }: { label: string; value: string; count: number }) {
  return (
    <div className="rounded-sm2 border border-line px-2.5 py-1.5">
      <div className="text-[10.5px] text-ink-faint">{label}</div>
      <div className="font-mono text-[13px] font-bold text-ink">{value}</div>
      <div className="text-[10.5px] text-ink-faint">
        taxable value · {count} invoice{count === 1 ? '' : 's'}
      </div>
    </div>
  );
}
