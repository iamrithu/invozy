import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { authorizeSignedPage } from '@/lib/signed-request';
import { cn } from '@/lib/utils';
import { loadPrintLetterhead } from '@/components/print/print-data';
import { PrintPageShell } from '@/components/print/print-page-shell';
import { CleanDoc, DocTable, Letterhead, MetaStrip, RULE, Td, Th, TotalTr, Tr } from '@/components/print/clean-doc';
import { fmtAmount, fmtDocDate, fmtRupees } from '@/components/print/format';
import type { SalesRow, TaxHeads } from '@/app/(app)/reports/report-queries';
import { loadMonthlyReport, type Kpi, type MonthlyReport } from './monthly-report-data';
import { isReportMonth } from './month';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Monthly report', robots: { index: false, follow: false } };

type Search = { m?: string | string[]; t?: string | string[] };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);

/**
 * What the PDF renderer prints for /api/pdf/monthly-report (and the
 * monthly email, via src/lib/monthly-report-pdf.ts): one calendar month's
 * business in the Clean document style — headline figures against the
 * month before, best customers and products, collections, who owes what,
 * and the GST position. Every figure comes from the Reports page's own
 * queries, so the PDF matches the screen.
 *
 * Outside the (app) shell and the session proxy — access is a short-lived
 * 'print-monthly-report' token bound to this month (`?m=YYYY-MM&t=…`);
 * anything else is a 404.
 */
export default async function PrintMonthlyReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams;
  const month = one(query.m);
  if (!isReportMonth(month) || !(await authorizeSignedPage('print-monthly-report', one(query.t), month))) notFound();

  const [report, company] = await Promise.all([loadMonthlyReport(month), loadPrintLetterhead()]);
  if (!company) notFound();

  return (
    <PrintPageShell>
      <CleanDoc title="Monthly report">
        <Letterhead company={company} />
        <MetaStrip
          items={[
            { label: 'Month', value: report.label },
            { label: 'Period', value: `${fmtDocDate(report.from)} – ${fmtDocDate(report.to)}` },
            { label: 'Compared with', value: report.prevLabel },
            { label: 'Balances as of', value: fmtDocDate(report.asOf) },
          ]}
        />
        <KeyFigures report={report} />
        <SalesSection
          title="Sales by customer"
          note={report.customerCount > report.topCustomers.length ? `Top ${report.topCustomers.length} of ${report.customerCount} customers` : `${report.customerCount} customers`}
          rows={report.topCustomers}
          first="Customer"
          detail="invoices"
          total={report.sales.revenue}
        />
        <SalesSection
          title="Sales by product"
          note={report.productCount > report.topProducts.length ? `Top ${report.topProducts.length} of ${report.productCount} products` : `${report.productCount} products`}
          rows={report.topProducts}
          first="Product"
          detail="qty"
          total={report.sales.revenue}
        />
        {report.sales.costUnknownLines > 0 && (
          <p className={cn('border-b px-2.5 py-1.5 text-[9.5px] text-[#4b5563]', RULE)}>
            Profit leaves out {report.sales.costUnknownLines} product{report.sales.costUnknownLines === 1 ? '' : 's'} with no purchase cost on file ({fmtRupees(report.sales.costUnknownRevenue)} of
            sales); a * marks a figure that&apos;s partial for that reason. Cost is each product&apos;s average purchase cost; profit is before tax.
          </p>
        )}
        <CollectionsSection report={report} />
        <ReceivablesSection report={report} />
        <GstSection report={report} />
      </CleanDoc>
    </PrintPageShell>
  );
}

/** A section's heading band: name on the left, what it covers on the right. */
function Heading({ title, note }: { title: string; note?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 border-b px-2.5 pb-1 pt-3 [break-after:avoid]', RULE)}>
      <span className="text-[12px] uppercase tracking-[0.07em]">{title}</span>
      {note && <span className="text-[9px] text-[#4b5563]">{note}</span>}
    </div>
  );
}

const pct = (n: number | null, digits = 1) => (n === null ? '—' : `${(n * 100).toFixed(digits)}%`);

function kpiValue(k: Kpi, v: number | null): string {
  if (v === null) return '—';
  if (k.kind === 'money') return fmtRupees(v);
  if (k.kind === 'days') return `${v.toFixed(1)} days`;
  if (k.kind === 'pct') return pct(v);
  return v.toLocaleString('en-IN');
}

/** "+12.4%", "−3.0%", or "—" when there's nothing to compare against. */
function change(cur: number | null, prev: number | null): string {
  if (cur === null || prev === null || Math.abs(prev) < 0.005) return '—';
  const c = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(c) < 0.05) return '0%';
  return `${c > 0 ? '+' : '−'}${Math.abs(c).toFixed(1)}%`;
}

function KeyFigures({ report }: { report: MonthlyReport }) {
  return (
    <section>
      <Heading title="Key figures" note={`${report.label} against ${report.prevLabel}`} />
      <DocTable>
        <colgroup>
          <col />
          <col className="w-[34mm]" />
          <col className="w-[34mm]" />
          <col className="w-[22mm]" />
        </colgroup>
        <thead>
          <tr>
            <Th>Figure</Th>
            <Th align="right">{report.label}</Th>
            <Th align="right">{report.prevLabel}</Th>
            <Th align="right">Change</Th>
          </tr>
        </thead>
        <tbody>
          {report.kpis.map((k) => (
            <Tr key={k.label}>
              <Td>{k.label}</Td>
              <Td align="right">{kpiValue(k, k.current)}</Td>
              <Td align="right" className="text-[#4b5563]">
                {kpiValue(k, k.previous)}
              </Td>
              <Td align="right">{change(k.current, k.previous)}</Td>
            </Tr>
          ))}
        </tbody>
      </DocTable>
    </section>
  );
}

function SalesSection({ title, note, rows, first, detail, total }: { title: string; note: string; rows: SalesRow[]; first: string; detail: 'invoices' | 'qty'; total: number }) {
  return (
    <section>
      <Heading title={title} note={note} />
      {rows.length === 0 ? (
        <p className={cn('border-b px-2.5 py-3 text-center text-[#4b5563]', RULE)}>No sales this month.</p>
      ) : (
        <DocTable>
          <colgroup>
            <col className="w-[7mm]" />
            <col />
            <col className={detail === 'qty' ? 'w-[26mm]' : 'w-[16mm]'} />
            <col className="w-[26mm]" />
            <col className="w-[14mm]" />
            <col className="w-[24mm]" />
            <col className="w-[14mm]" />
          </colgroup>
          <thead>
            <tr>
              <Th align="right">#</Th>
              <Th>{first}</Th>
              <Th align="right">{detail === 'qty' ? 'Qty sold' : 'Invoices'}</Th>
              <Th align="right">Net sales ₹</Th>
              <Th align="right">Share</Th>
              <Th align="right">Profit ₹</Th>
              <Th align="right">Margin</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <Tr key={r.key}>
                <Td align="right" className="text-[#4b5563]">
                  {i + 1}
                </Td>
                <Td>{r.name}</Td>
                <Td align="right">{detail === 'qty' ? r.qtyLabel : r.invoices}</Td>
                <Td align="right">{fmtAmount(r.revenue)}</Td>
                <Td align="right">{pct(total > 0 ? r.revenue / total : 0)}</Td>
                <Td align="right">
                  {r.profit === null ? '—' : fmtAmount(r.profit)}
                  {r.costUnknownLines > 0 && r.profit !== null ? '*' : ''}
                </Td>
                <Td align="right">{pct(r.margin)}</Td>
              </Tr>
            ))}
          </tbody>
        </DocTable>
      )}
    </section>
  );
}

function CollectionsSection({ report }: { report: MonthlyReport }) {
  const c = report.collections;
  const note =
    c.avgDaysToPay === null
      ? undefined
      : `${c.paidInvoices} invoice${c.paidInvoices === 1 ? '' : 's'} paid in full · ${c.avgDaysToPay.toFixed(1)} days on average · ${pct(c.onTimeShare, 0)} by the due date`;
  return (
    <section className="[break-inside:avoid]">
      <Heading title="Collections" note={note} />
      {c.count === 0 ? (
        <p className={cn('border-b px-2.5 py-3 text-center text-[#4b5563]', RULE)}>No payments received this month.</p>
      ) : (
        <DocTable>
          <colgroup>
            <col />
            <col className="w-[22mm]" />
            <col className="w-[32mm]" />
            <col className="w-[18mm]" />
          </colgroup>
          <thead>
            <tr>
              <Th>Mode</Th>
              <Th align="right">Payments</Th>
              <Th align="right">Amount ₹</Th>
              <Th align="right">Share</Th>
            </tr>
          </thead>
          <tbody>
            {c.byMode.map((m) => (
              <Tr key={m.mode}>
                <Td>{m.mode}</Td>
                <Td align="right">{m.count}</Td>
                <Td align="right">{fmtAmount(m.amount)}</Td>
                <Td align="right">{pct(m.share)}</Td>
              </Tr>
            ))}
            <TotalTr>
              <Td>Total collected</Td>
              <Td align="right">{c.count}</Td>
              <Td align="right">{fmtAmount(c.total)}</Td>
              <Td align="right">100.0%</Td>
            </TotalTr>
          </tbody>
        </DocTable>
      )}
    </section>
  );
}

const BUCKETS = [
  { key: 'notDue', label: 'Not due' },
  { key: 'd1to30', label: '1–30 days' },
  { key: 'd31to60', label: '31–60 days' },
  { key: 'd61to90', label: '61–90 days' },
  { key: 'd90plus', label: 'Over 90 days' },
] as const;

function ReceivablesSection({ report }: { report: MonthlyReport }) {
  const r = report.receivables;
  const t = r.totals;
  const top = r.rows.slice(0, 10);
  return (
    <section>
      <Heading title="Receivables" note={`Unpaid invoices dated up to ${fmtDocDate(report.to)}, by days past due on ${fmtDocDate(report.asOf)}`} />
      {t.due <= 0.004 ? (
        <p className={cn('border-b px-2.5 py-3 text-center text-[#4b5563]', RULE)}>Nothing outstanding.</p>
      ) : (
        <>
          <DocTable className="[break-inside:avoid]">
            <thead>
              <tr>
                <Th />
                {BUCKETS.map((b) => (
                  <Th key={b.key} align="right">
                    {b.label}
                  </Th>
                ))}
                <Th align="right">Total ₹</Th>
              </tr>
            </thead>
            <tbody>
              <Tr>
                <Td>Amount ₹</Td>
                {BUCKETS.map((b) => (
                  <Td key={b.key} align="right">
                    {fmtAmount(t[b.key])}
                  </Td>
                ))}
                <Td align="right">{fmtAmount(t.due)}</Td>
              </Tr>
              <Tr>
                <Td>Share</Td>
                {BUCKETS.map((b) => (
                  <Td key={b.key} align="right" className="text-[#4b5563]">
                    {pct(t[b.key] / t.due)}
                  </Td>
                ))}
                <Td align="right" className="text-[#4b5563]">
                  100.0%
                </Td>
              </Tr>
            </tbody>
          </DocTable>
          <div className={cn('grid grid-cols-3 border-b', RULE)}>
            <Figure label="Overdue" value={`${fmtRupees(t.overdue)} (${pct(t.due ? t.overdue / t.due : 0, 0)})`} />
            <Figure label="Days sales outstanding" value={r.dso === null ? '—' : `${r.dso.toFixed(1)} days`} border />
            <Figure label="Collection rate" value={pct(r.collectionRate)} border />
          </div>
          <DocTable>
            <colgroup>
              <col className="w-[7mm]" />
              <col />
              <col className="w-[26mm]" />
              <col className="w-[26mm]" />
              <col className="w-[58mm]" />
            </colgroup>
            <thead>
              <tr>
                <Th align="right">#</Th>
                <Th>Largest balances</Th>
                <Th align="right">Due ₹</Th>
                <Th align="right">Over 30 days ₹</Th>
                <Th>Oldest unpaid</Th>
              </tr>
            </thead>
            <tbody>
              {top.map((row, i) => (
                <Tr key={row.customerId}>
                  <Td align="right" className="text-[#4b5563]">
                    {i + 1}
                  </Td>
                  <Td>{row.name}</Td>
                  <Td align="right">{fmtAmount(row.due)}</Td>
                  <Td align="right">{fmtAmount(row.buckets.d31to60 + row.buckets.d61to90 + row.buckets.d90plus)}</Td>
                  <Td>
                    {row.oldest.number} · {fmtDocDate(row.oldest.date)}
                    {row.oldest.daysOverdue > 0 && <span className="text-[#4b5563]"> · {row.oldest.daysOverdue}d late</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DocTable>
        </>
      )}
    </section>
  );
}

function Figure({ label, value, border = false }: { label: string; value: string; border?: boolean }) {
  return (
    <div className={cn('grid gap-px px-2.5 py-1.5', border && 'border-l', RULE)}>
      <span className="block text-[9px] uppercase tracking-[0.07em] text-[#4b5563]">{label}</span>
      <span className="text-[11px]">{value}</span>
    </div>
  );
}

type Heads = Omit<TaxHeads, 'count'>;

function GstSection({ report }: { report: MonthlyReport }) {
  const g = report.gst;
  const sub = (a: Heads, b: Heads): Heads => ({ taxable: a.taxable - b.taxable, cgst: a.cgst - b.cgst, sgst: a.sgst - b.sgst, igst: a.igst - b.igst });
  const netOutput = sub(g.sales, g.returns);
  const rows: { label: string; heads: Heads; total?: boolean }[] = [
    { label: `Sales · ${g.sales.count} invoice${g.sales.count === 1 ? '' : 's'}`, heads: g.sales },
    { label: `Less: credit notes · ${g.returns.count} note${g.returns.count === 1 ? '' : 's'}`, heads: g.returns },
    { label: 'Net output tax', heads: netOutput, total: true },
  ];
  let net: Heads | null = null;
  if (g.input) {
    net = sub(netOutput, g.input);
    rows.push({ label: `Less: input tax · ${g.input.count} bill${g.input.count === 1 ? '' : 's'}`, heads: g.input });
  }
  const tax = (h: Heads) => h.cgst + h.sgst + h.igst;
  return (
    <section className="[break-inside:avoid]">
      <Heading title="GST summary" note={`B2B taxable ${fmtRupees(g.b2b.taxable)} · B2C taxable ${fmtRupees(g.b2c.taxable)}`} />
      <DocTable>
        <colgroup>
          <col />
          <col className="w-[28mm]" />
          <col className="w-[22mm]" />
          <col className="w-[22mm]" />
          <col className="w-[22mm]" />
          <col className="w-[24mm]" />
        </colgroup>
        <thead>
          <tr>
            <Th />
            <Th align="right">Taxable ₹</Th>
            <Th align="right">CGST ₹</Th>
            <Th align="right">SGST ₹</Th>
            <Th align="right">IGST ₹</Th>
            <Th align="right">Total tax ₹</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            r.total ? (
              <TotalTr key={r.label}>
                <GstCells label={r.label} heads={r.heads} tax={tax(r.heads)} />
              </TotalTr>
            ) : (
              <Tr key={r.label}>
                <GstCells label={r.label} heads={r.heads} tax={tax(r.heads)} />
              </Tr>
            )
          )}
          {net && (
            <TotalTr>
              <Td>{tax(net) >= 0 ? 'Net GST payable' : 'GST credit to carry forward'}</Td>
              <Td align="right">—</Td>
              <Td align="right">{fmtAmount(net.cgst)}</Td>
              <Td align="right">{fmtAmount(net.sgst)}</Td>
              <Td align="right">{fmtAmount(net.igst)}</Td>
              <Td align="right">{fmtAmount(Math.abs(tax(net)))}</Td>
            </TotalTr>
          )}
        </tbody>
      </DocTable>
      <p className="px-2.5 py-1.5 text-[9px] text-[#4b5563]">
        Every invoice issued in the month, paid or not. A quick check before filing — the accountant&apos;s set-off between heads may differ; the total doesn&apos;t.
      </p>
    </section>
  );
}

function GstCells({ label, heads, tax }: { label: string; heads: Heads; tax: number }) {
  return (
    <>
      <Td>{label}</Td>
      <Td align="right">{fmtAmount(heads.taxable)}</Td>
      <Td align="right">{fmtAmount(heads.cgst)}</Td>
      <Td align="right">{fmtAmount(heads.sgst)}</Td>
      <Td align="right">{fmtAmount(heads.igst)}</Td>
      <Td align="right">{fmtAmount(tax)}</Td>
    </>
  );
}
