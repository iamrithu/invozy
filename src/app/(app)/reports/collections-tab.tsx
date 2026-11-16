'use client';

import Link from 'next/link';
import { Banknote, CalendarCheck, Coins, HandCoins, ReceiptText, Timer, TrendingUp, Wallet } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarList } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { CardSkeleton, ChangeBadge, EmptyState, Refreshing, ReportCard, StatTile, TilesSkeleton } from '@/components/reports/report-ui';
import { daysText, fmtMoneyWhole, fmtDay, fmtPct } from '@/components/reports/format';
import { useCollections } from '@/hooks/use-reports';
import { fmtInr } from '@/lib/gst';
import type { ReportFilters } from '@/actions/reports';

/** Collections: money received in the period, by payment date — how it
 * came in (cash, UPI, cheque… and credit notes adjusted), when it came in,
 * the largest receipts, and how long customers take to clear a bill. */
export function CollectionsTab({ filters, currency }: { filters: ReportFilters; currency?: string }) {
  const { data, isPlaceholderData } = useCollections(filters);
  const money = (n: number) => fmtInr(n, currency);

  if (!data) {
    return (
      <div className="space-y-3">
        <TilesSkeleton />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[5fr_7fr]">
          <CardSkeleton rows={5} />
          <CardSkeleton chart rows={0} />
        </div>
        <CardSkeleton rows={6} />
      </div>
    );
  }

  const received = data.total - data.creditNotes;
  const allTime = !filters.dateFrom && !filters.dateTo;

  return (
    <Refreshing busy={isPlaceholderData}>
      <div className="mb-3.5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile
          icon={<Wallet size={14} />}
          label="Collected"
          value={money(data.total)}
          badge={<ChangeBadge current={data.total} previous={data.prevTotal} />}
          sub={data.creditNotes > 0.004 ? `${money(data.creditNotes)} by credit notes` : data.prevTotal !== null ? `${money(data.prevTotal)} before` : undefined}
        />
        <StatTile
          icon={<ReceiptText size={14} />}
          label="Payments"
          value={data.count.toLocaleString('en-IN')}
          sub={data.count ? `${money(data.total / data.count)} on average` : undefined}
        />
        <StatTile
          icon={<Timer size={14} />}
          label="Average time to pay"
          value={data.avgDaysToPay === null ? '—' : daysText(data.avgDaysToPay)}
          sub={data.paidInvoices ? `Invoice date to paid in full · ${data.paidInvoices} invoice${data.paidInvoices === 1 ? '' : 's'}` : 'No invoice fully paid in this period'}
        />
        <StatTile
          icon={<CalendarCheck size={14} />}
          label="Paid by the due date"
          value={data.onTimeShare === null ? '—' : fmtPct(data.onTimeShare, 0)}
          tone={data.onTimeShare !== null && data.onTimeShare < 0.5 ? 'red' : undefined}
          sub={data.onTimeShare !== null ? `${Math.round(data.onTimeShare * data.paidInvoices)} of ${data.paidInvoices} settled in time` : undefined}
        />
      </div>

      {data.count === 0 ? (
        <ReportCard icon={<HandCoins size={13} className="text-brand" />} title="Collections">
          <EmptyState icon={<HandCoins size={16} />}>No payments received in this period. Payments recorded against invoices show up here by the date they were received.</EmptyState>
        </ReportCard>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[5fr_7fr]">
            <ReportCard
              icon={<Coins size={13} className="text-brand" />}
              title="By payment mode"
              sub={data.creditNotes > 0.004 ? `${money(received)} received in money, the rest adjusted from credit notes` : 'Share of everything collected'}
            >
              <BarList
                barClassName="bg-green"
                items={data.byMode.map((m) => ({
                  key: m.mode,
                  label: m.mode,
                  sub: `${m.count} payment${m.count === 1 ? '' : 's'}`,
                  value: m.amount,
                  valueLabel: money(m.amount),
                  note: fmtPct(m.share, 0),
                }))}
              />
            </ReportCard>
            <ReportCard
              icon={<TrendingUp size={13} className="text-brand" />}
              title={data.granularity === 'day' ? 'Collected per day' : 'Collected per month'}
              sub={allTime ? 'Last 6 months' : 'By the date each payment was received'}
            >
              <ColumnChart
                label={data.granularity === 'day' ? 'Collected per day' : 'Collected per month'}
                color="bg-green"
                data={data.trend.map((t) => ({ key: t.key, label: t.label, value: t.amount }))}
                format={money}
                formatAxis={(n) => fmtMoneyWhole(n, currency)}
                emptyText="No payments in this stretch."
              />
            </ReportCard>
          </div>

          <ReportCard icon={<Banknote size={13} className="text-brand" />} title="Largest payments" sub="The ten biggest receipts in the period">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.largest.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-ink-soft">{fmtDay(p.date)}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-bold text-ink">
                      <Link href={`/customers?open=${encodeURIComponent(p.customerId)}`} className="hover:text-brand hover:underline">
                        {p.customer}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/invoices/${encodeURIComponent(p.invoiceId)}`} className="font-mono text-[12px] font-bold text-ink-soft hover:text-brand hover:underline">
                        {p.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ink-soft">{p.mode}</TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-[11.5px] text-ink-faint">{[p.receiptNo, p.reference].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono font-bold text-ink">{money(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </>
      )}
    </Refreshing>
  );
}
