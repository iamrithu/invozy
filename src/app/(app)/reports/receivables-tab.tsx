'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, CheckCircle2, Download, Gauge, Hourglass, Percent, Search, UserRound, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SegmentedBar } from '@/components/charts/segmented-bar';
import { PdfDownloadButton } from '@/components/print/pdf-download-button';
import { pdfFileName } from '@/components/print/format';
import { AGEING } from '@/components/reports/ageing';
import { CardSkeleton, EmptyState, Refreshing, ReportCard, SortHead, StatTile, TilesSkeleton, useSortedRows } from '@/components/reports/report-ui';
import { downloadCsv } from '@/components/reports/csv-download';
import { daysText, fmtDay, fmtPct, rangeLabel } from '@/components/reports/format';
import { useReceivables } from '@/hooks/use-reports';
import { fmtInr } from '@/lib/gst';
import type { AgeingBucket, ReceivableRow, ReportFilters } from '@/actions/reports';

type SortKey = 'name' | 'due' | AgeingBucket | 'oldest' | 'lastPayment';

/** Receivables: what customers still owe on issued invoices dated in the
 * period, aged by how far past due it is today — as one split bar, then
 * customer by customer with their oldest unpaid bill, when they last paid,
 * and one click to their statement or their ledger. DSO and collection
 * rate say how quickly the period's billing is turning into money. */
export function ReceivablesTab({ filters, currency }: { filters: ReportFilters; currency?: string }) {
  const { data, isPlaceholderData } = useReceivables(filters);
  const [search, setSearch] = useState('');
  const money = (n: number) => fmtInr(n, currency);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.rows ?? [];
    return q ? list.filter((r) => r.name.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q) || (r.phone ?? '').includes(q)) : list;
  }, [data, search]);
  const { sorted, sort, toggle } = useSortedRows<ReceivableRow, SortKey>(rows, { key: 'due', dir: 'desc' }, (r, k) =>
    k === 'name' ? r.name : k === 'due' ? r.due : k === 'oldest' ? r.oldest.daysOverdue : k === 'lastPayment' ? r.lastPayment : r.buckets[k]
  );

  if (!data) {
    return (
      <div className="space-y-3">
        <TilesSkeleton />
        <CardSkeleton rows={2} />
        <CardSkeleton rows={8} />
      </div>
    );
  }

  const { totals } = data;
  const periodText = filters.dateFrom || filters.dateTo ? `invoices dated ${rangeLabel(filters.dateFrom, filters.dateTo)}` : 'all invoices';
  const range = { from: filters.dateFrom, to: filters.dateTo };
  // Dates in this year drop the year — the table is wide enough already.
  const year = data.asOf.slice(0, 4);

  function exportCsv() {
    downloadCsv(
      'receivables',
      range,
      ['Customer', 'Detail', 'Phone', 'Total due', ...AGEING.map((b) => b.label), 'Unpaid invoices', 'Oldest unpaid invoice', 'Oldest invoice date', 'Days overdue', 'Last payment'],
      sorted.map((r) => [
        r.name,
        r.sub,
        r.phone,
        r.due,
        ...AGEING.map((b) => r.buckets[b.key]),
        r.invoices,
        r.oldest.number,
        r.oldest.date,
        r.oldest.daysOverdue,
        r.lastPayment,
      ])
    );
  }

  return (
    <Refreshing busy={isPlaceholderData}>
      <div className="mb-3.5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile
          icon={<Wallet size={14} />}
          label="Outstanding"
          value={money(totals.due)}
          sub={`${totals.invoices} invoice${totals.invoices === 1 ? '' : 's'} · ${data.rows.length} customer${data.rows.length === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={<AlarmClock size={14} />}
          label="Overdue"
          value={money(totals.overdue)}
          tone={totals.overdue > 0.004 ? 'red' : undefined}
          sub={totals.due > 0.004 ? `${fmtPct(totals.overdue / totals.due, 0)} of what's owed` : undefined}
        />
        <StatTile
          icon={<Gauge size={14} />}
          label="Days sales outstanding"
          value={data.dso === null ? '—' : daysText(data.dso)}
          sub={data.dso === null ? 'Nothing billed' : `Owed ≈ this many days of billing`}
        />
        <StatTile
          icon={<Percent size={14} />}
          label="Collection rate"
          value={data.collectionRate === null ? '—' : fmtPct(data.collectionRate)}
          tone={data.collectionRate !== null && data.collectionRate >= 0.995 ? 'green' : undefined}
          sub={data.collectionRate === null ? 'Nothing billed' : `${money(data.settled)} of ${money(data.billed)}`}
        />
      </div>

      {totals.due <= 0.004 ? (
        <ReportCard icon={<Hourglass size={13} className="text-brand" />} title="Ageing">
          <EmptyState icon={<CheckCircle2 size={16} />}>Nothing outstanding — every issued invoice in this period is fully paid.</EmptyState>
        </ReportCard>
      ) : (
        <>
          <ReportCard icon={<Hourglass size={13} className="text-brand" />} title="Ageing" sub={`Unpaid balance on ${periodText}, by days past the due date as of ${fmtDay(data.asOf)}`} className="mb-3">
            <SegmentedBar
              label="Outstanding by days past due"
              format={money}
              segments={AGEING.map((b) => ({ key: b.key, label: b.label, value: totals[b.key], fill: b.fill, ink: b.ink }))}
            />
          </ReportCard>

          <ReportCard
            icon={<UserRound size={13} className="text-brand" />}
            title="Who owes what"
            sub="Largest balance first. Statement downloads the customer's full statement of account."
            action={
              <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={sorted.length === 0} title="Download this table as Excel (CSV)">
                <Download size={13} /> CSV
              </Button>
            }
          >
            <div className="relative mb-2.5 max-w-xs">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or phone…" className="h-8 pl-8 text-[12.5px]" aria-label="Search customers" />
            </div>
            {sorted.length === 0 ? (
              <EmptyState icon={<Search size={16} />}>Nothing matches “{search}”.</EmptyState>
            ) : (
              <Table className="min-w-[900px] text-[12px] [&_td]:px-2 [&_th]:px-2">
                <TableHeader>
                  <TableRow>
                    <SortHead label="Customer" sortKey="name" sort={sort} onSort={toggle} firstDir="asc" />
                    <SortHead label="Total due" sortKey="due" sort={sort} onSort={toggle} align="right" />
                    {AGEING.map((b) => (
                      <SortHead key={b.key} label={b.short} sortKey={b.key} sort={sort} onSort={toggle} align="right" className="px-2" />
                    ))}
                    <SortHead label="Oldest unpaid" sortKey="oldest" sort={sort} onSort={toggle} />
                    <SortHead label="Last paid" sortKey="lastPayment" sort={sort} onSort={toggle} />
                    <TableHead className="w-[76px]">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((r) => (
                    <TableRow key={r.customerId}>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate font-bold text-ink" title={r.phone ?? undefined}>
                          {r.name}
                        </div>
                        <div className="truncate text-[11px] text-ink-faint">{r.sub || r.phone || ''}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono font-bold text-ink">{money(r.due)}</TableCell>
                      {AGEING.map((b) => (
                        <TableCell key={b.key} className={`whitespace-nowrap px-2 text-right font-mono ${r.buckets[b.key] > 0.004 ? (b.key === 'notDue' ? 'text-ink-soft' : 'font-semibold text-red') : 'text-ink-faint'}`}>
                          {r.buckets[b.key] > 0.004 ? money(r.buckets[b.key]) : '—'}
                        </TableCell>
                      ))}
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/invoices/${encodeURIComponent(r.oldest.id)}`} className="font-mono text-[12px] font-bold text-ink hover:text-brand hover:underline">
                          {r.oldest.number}
                        </Link>
                        <div className="text-[11px] text-ink-faint">
                          {fmtDay(r.oldest.date, r.oldest.date.slice(0, 4) !== year)}
                          {r.oldest.daysOverdue > 0 && <span className="text-red"> · {r.oldest.daysOverdue}d late</span>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12px] text-ink-soft">{r.lastPayment ? fmtDay(r.lastPayment, r.lastPayment.slice(0, 4) !== year) : <span className="text-ink-faint">Never</span>}</TableCell>
                      <TableCell className="whitespace-nowrap p-1.5">
                        <div className="flex justify-end">
                          <PdfDownloadButton
                            iconOnly
                            href={`/api/pdf/statements/${encodeURIComponent(r.customerId)}`}
                            fileName={pdfFileName(`Statement-${r.name.trim().replace(/\s+/g, '-')}`).replace(/-{2,}/g, '-')}
                            label={`Download ${r.name}'s statement`}
                          />
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" asChild>
                            <Link href={`/customers?open=${encodeURIComponent(r.customerId)}`} aria-label={`Open ${r.name}`} title="Open customer — invoices and ledger">
                              <UserRound size={14} />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {!search && (
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="text-ink">Total · {data.rows.length}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-ink">{money(totals.due)}</TableCell>
                      {AGEING.map((b) => (
                        <TableCell key={b.key} className="whitespace-nowrap px-2 text-right font-mono text-ink-soft">
                          {totals[b.key] > 0.004 ? money(totals[b.key]) : '—'}
                        </TableCell>
                      ))}
                      <TableCell colSpan={3} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            )}
          </ReportCard>
        </>
      )}
    </Refreshing>
  );
}
