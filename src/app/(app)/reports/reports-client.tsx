'use client';

import { useMemo, useState } from 'react';
import { Receipt, Percent, TrendingUp, TrendingDown, Wallet, Users, BarChart3, Download, Printer, FileText, PieChart, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { DateRangeFilter } from '@/components/filters/date-range-filter';
import { BillingTrendChart } from '@/components/charts/billing-trend-chart';
import { StatusBreakdownChart } from '@/components/charts/status-breakdown-chart';
import { TopProductsChart } from '@/components/charts/top-products-chart';
import { useCustomersForFilter } from '@/hooks/use-customers';
import { useReportStats, usePreviousPeriodStats, useBillingTrend, useTopCustomers, useStatusBreakdown, useTopProducts } from '@/hooks/use-reports';
import { fmtInr } from '@/lib/gst';
import { customerDisplayName } from '@/lib/customer';
import { resolveDateRange, type DateFilterMode } from '@/lib/dates';
import type { getReportStats, getBillingTrend, getTopCustomers, getStatusBreakdown, getTopProducts, ReportFilters } from '@/actions/reports';

type Stats = Awaited<ReturnType<typeof getReportStats>>;
type TopCustomer = Awaited<ReturnType<typeof getTopCustomers>>[number];

export function ReportsClient({
  initialStats,
  initialTrend,
  initialTopCustomers,
  initialStatusBreakdown,
  initialTopProducts,
  currency,
}: {
  initialStats: Stats;
  initialTrend: Awaited<ReturnType<typeof getBillingTrend>>;
  initialTopCustomers: TopCustomer[];
  initialStatusBreakdown: Awaited<ReturnType<typeof getStatusBreakdown>>;
  initialTopProducts: Awaited<ReturnType<typeof getTopProducts>>;
  currency?: string;
}) {
  const [dateMode, setDateMode] = useState<DateFilterMode>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from: dateFrom, to: dateTo } = resolveDateRange(dateMode, customFrom, customTo);

  const [customerId, setCustomerId] = useState('all');
  const [status, setStatus] = useState<'all' | 'SENT' | 'PARTIALLY_PAID' | 'PAID'>('all');

  const filters: ReportFilters = { dateFrom, dateTo, customerId: customerId === 'all' ? undefined : customerId, status };
  const isDefault = dateMode === 'all' && customerId === 'all' && status === 'all';

  const { data: customerOptions } = useCustomersForFilter();
  const { data: stats } = useReportStats(filters, isDefault ? initialStats : undefined);
  const { data: previousStats } = usePreviousPeriodStats(filters);
  const { data: trend } = useBillingTrend(filters, isDefault ? initialTrend : undefined);
  const { data: topCustomers } = useTopCustomers(filters, isDefault ? initialTopCustomers : undefined);
  const { data: statusBreakdown } = useStatusBreakdown(filters, isDefault ? initialStatusBreakdown : undefined);
  const { data: topProducts } = useTopProducts(filters, isDefault ? initialTopProducts : undefined);

  const s = stats ?? initialStats;
  const totalTax = s.cgst + s.sgst + s.igst;
  const customers = topCustomers ?? initialTopCustomers;
  const statuses = statusBreakdown ?? initialStatusBreakdown;
  const products = topProducts ?? initialTopProducts;

  const statCards = useMemo(
    () => [
      { icon: <Receipt size={14} />, label: 'Taxable value', value: s.taxable, prev: previousStats?.taxable },
      { icon: <Percent size={14} />, label: 'CGST + SGST', value: s.cgst + s.sgst, prev: previousStats ? previousStats.cgst + previousStats.sgst : undefined },
      { icon: <Percent size={14} />, label: 'IGST', value: s.igst, prev: previousStats?.igst },
      { icon: <TrendingUp size={14} />, label: 'Total billed', value: s.total, prev: previousStats?.total },
      { icon: <Wallet size={14} />, label: 'Outstanding', value: s.outstanding, prev: previousStats?.outstanding },
    ],
    [s, previousStats]
  );

  function exportCsv() {
    const rows: string[][] = [
      ['Report', 'Value'],
      ['Taxable value', s.taxable.toFixed(2)],
      ['CGST', s.cgst.toFixed(2)],
      ['SGST', s.sgst.toFixed(2)],
      ['IGST', s.igst.toFixed(2)],
      ['Total billed', s.total.toFixed(2)],
      ['Outstanding', s.outstanding.toFixed(2)],
      ['Invoice count', String(s.invoiceCount)],
      [],
      ['Status', 'Count', 'Total'],
      ...statuses.map((st) => [st.label, String(st.count), st.total.toFixed(2)]),
      [],
      ['Product', 'Qty', 'Revenue'],
      ...products.map((p) => [p.name, String(p.qty), p.revenue.toFixed(2)]),
      [],
      ['Customer', 'State', 'Invoices', 'Total billed', 'Outstanding'],
      ...customers.map((c) => [customerDisplayName(c), c.state, String(c.count), c.total.toFixed(2), c.balance.toFixed(2)]),
    ];
    const csv = rows.map((r) => r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const rangeLabel = dateMode === 'all' ? 'all-time' : `${dateFrom ?? 'start'}_to_${dateTo ?? 'now'}`;
    a.download = `report-${rangeLabel}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
            <BarChart3 size={18} className="text-brand" /> Reports
          </h1>
          <p className="mt-1 text-[12.5px] text-ink-faint">Sent and paid invoices only — drafts aren&apos;t counted until they go out.</p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
            <Download size={13} /> Export CSV
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={13} /> Print / Save PDF
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl2 border border-line bg-surface p-3 shadow-card print:hidden">
        <DateRangeFilter mode={dateMode} onModeChange={setDateMode} from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="h-8 w-[190px] flex-shrink-0 text-[11.5px]">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customerOptions?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {customerDisplayName(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-8 w-[150px] flex-shrink-0 text-[11.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="PARTIALLY_PAID">Partially paid</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
          </SelectContent>
        </Select>
        {dateMode !== 'all' && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-faint">
            <FileText size={11} /> {s.invoiceCount} invoice{s.invoiceCount === 1 ? '' : 's'} in range
          </span>
        )}
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-2 md:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-lg2 border border-line bg-surface p-2.5 shadow-card transition-colors hover:border-brand/50">
            <div className="flex items-center justify-between">
              <div className="flex h-6 w-6 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">{card.icon}</div>
              <ChangeBadge current={card.value} previous={card.prev} />
            </div>
            <div className="mt-1.5 font-mono text-[15px] font-extrabold text-ink">{fmtInr(card.value, currency)}</div>
            <div className="mt-0.5 text-[10.5px] text-ink-faint">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[7fr_5fr]">
        <ReportCard icon={<TrendingUp size={13} className="text-brand" />} title="Billing &amp; collection trend">
          <BillingTrendChart data={trend ?? initialTrend} />
        </ReportCard>

        <ReportCard icon={<Receipt size={13} className="text-brand" />} title="Tax composition">
          {totalTax <= 0 ? (
            <p className="py-8 text-center text-[12.5px] text-ink-faint">No tax collected in this period.</p>
          ) : (
            <div className="flex items-center gap-4">
              <TaxDonut cgst={s.cgst} sgst={s.sgst} igst={s.igst} currency={currency} />
              <div className="flex-1 space-y-1.5">
                {s.cgst > 0 && <Legend color="hsl(var(--brand))" label="CGST" value={fmtInr(s.cgst, currency)} />}
                {s.sgst > 0 && <Legend color="hsl(var(--gold))" label="SGST" value={fmtInr(s.sgst, currency)} />}
                {s.igst > 0 && <Legend color="hsl(var(--green))" label="IGST" value={fmtInr(s.igst, currency)} />}
              </div>
            </div>
          )}
        </ReportCard>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ReportCard icon={<PieChart size={13} className="text-brand" />} title="Status breakdown">
          <StatusBreakdownChart data={statuses} currency={currency} />
        </ReportCard>

        <ReportCard icon={<Package size={13} className="text-brand" />} title="Top products">
          <TopProductsChart data={products} currency={currency} />
        </ReportCard>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center gap-2 text-[12.5px] font-extrabold text-ink">
          <Users size={13} className="text-brand" /> Top customers by billing
        </div>
        <div className="rounded-xl2 border border-line bg-surface shadow-card">
          {customers.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-ink-faint">No billing data in this period.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Invoices</TableHead>
                  <TableHead className="text-right">Total billed</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-bold text-ink">{customerDisplayName(c)}</TableCell>
                    <TableCell className="text-ink-soft">{c.state}</TableCell>
                    <TableCell className="text-ink-soft">{c.count}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{fmtInr(c.total, currency)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${c.balance > 0 ? 'text-red' : 'text-green'}`}>{fmtInr(c.balance, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-3 shadow-card">
      <div className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-extrabold text-ink">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

/** % change vs the previous equivalent period — hidden entirely when there's
 * no previous-period figure to compare against (e.g. "All time", which has
 * no well-defined "period before all of history" — see
 * getPreviousPeriodStats) or when the previous period had nothing billed
 * (a from-zero "+∞%" reads as noise, not signal). */
function ChangeBadge({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined || previous === null || previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct > 0.5;
  const down = pct < -0.5;
  if (!up && !down) return null;
  return (
    <span className={`flex items-center gap-0.5 text-[10.5px] font-extrabold ${up ? 'text-green' : 'text-red'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function TaxDonut({ cgst, sgst, igst, currency }: { cgst: number; sgst: number; igst: number; currency?: string }) {
  const total = cgst + sgst + igst;
  const R = 46,
    C = 2 * Math.PI * R,
    cx = 60,
    cy = 60;
  const gap = 3;
  const segs = [
    { val: cgst, color: 'hsl(var(--brand))' },
    { val: sgst, color: 'hsl(var(--gold))' },
    { val: igst, color: 'hsl(var(--green))' },
  ].filter((seg) => seg.val > 0);
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="h-[120px] w-[120px] flex-shrink-0">
      {segs.map((seg, i) => {
        const len = Math.max((seg.val / total) * C - gap, 0);
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += (seg.val / total) * C;
        return el;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill="hsl(var(--ink-faint))">
        Total tax
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="12" fontWeight="bold" fill="hsl(var(--ink))">
        {fmtInr(total, currency)}
      </text>
    </svg>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm2" style={{ background: color }} />
      <span className="flex-1 text-ink-soft">{label}</span>
      <span className="font-mono font-bold text-ink">{value}</span>
    </div>
  );
}
