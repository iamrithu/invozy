'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, CalendarDays, Download, FileText, Info, Layers, Package, ReceiptText, Search, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ColumnChart } from '@/components/charts/column-chart';
import { InlineBar } from '@/components/charts/bar-list';
import {
  CardSkeleton,
  ChangeBadge,
  EmptyState,
  Growth,
  Refreshing,
  ReportCard,
  Segmented,
  SortHead,
  StatTile,
  TableSkeleton,
  TilesSkeleton,
  useSortedRows,
} from '@/components/reports/report-ui';
import { downloadCsv } from '@/components/reports/csv-download';
import { fmtCompactMoney, fmtPct, rangeLabel } from '@/components/reports/format';
import { useSalesAnalysis, useSalesByWeekday } from '@/hooks/use-reports';
import { fmtInr } from '@/lib/gst';
import type { ProfitTotals, ReportFilters, SalesDimension, SalesRow } from '@/actions/reports';

const DIMENSIONS: { value: SalesDimension; label: string; noun: string; plural: string }[] = [
  { value: 'customer', label: 'Customer', noun: 'Customer', plural: 'Customers billed' },
  { value: 'product', label: 'Product', noun: 'Product', plural: 'Products sold' },
  { value: 'category', label: 'Category', noun: 'Category', plural: 'Categories sold' },
];

type SortKey = 'name' | 'revenue' | 'prev' | 'growth' | 'cost' | 'profit' | 'margin' | 'qty' | 'invoices';

/** Which comparison the middle columns show — against the previous period,
 * or against cost. One at a time keeps the table readable on a laptop. */
type ColumnSet = 'growth' | 'profit';

/** Rows shown before "Show all" — a long customer list stays scannable. */
const PAGE = 25;

/** Sales analysis: the period's sales by customer, product or category,
 * each against the previous period of the same length — share, growth,
 * quantity and invoice count, or cost, profit and margin — plus which
 * weekdays sell best and who moved the most. Every figure is taxable value after credit notes (see
 * getSalesAnalysis), so the three views add up to the same total. */
export function SalesTab({ filters, currency }: { filters: ReportFilters; currency?: string }) {
  const [by, setBy] = useState<SalesDimension>('customer');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [columns, setColumns] = useState<ColumnSet>('growth');
  const { data, isPlaceholderData } = useSalesAnalysis(filters, by);
  const { data: weekdays } = useSalesByWeekday(filters);
  const money = (n: number) => fmtInr(n, currency);
  const dim = DIMENSIONS.find((d) => d.value === by)!;

  // While switching Customer → Product the previous view's rows are still
  // the placeholder; they belong to another dimension, so they wait as a
  // skeleton rather than sit under the wrong headings.
  const current = data?.by === by ? data : undefined;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = current?.rows ?? [];
    return q ? list.filter((r) => r.name.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q)) : list;
  }, [current, search]);
  const { sorted, sort, toggle } = useSortedRows<SalesRow, SortKey>(rows, { key: 'revenue', dir: 'desc' }, (r, k) =>
    k === 'name'
      ? r.name
      : k === 'revenue'
        ? r.revenue
        : k === 'prev'
          ? r.prevRevenue
          : k === 'growth'
            ? r.isNew
              ? Infinity
              : r.growth
            : k === 'cost'
              ? r.cost
              : k === 'profit'
                ? r.profit
                : k === 'margin'
                  ? r.margin
                  : k === 'qty'
                    ? r.qty
                    : r.invoices
  );

  if (!data) {
    return (
      <div className="space-y-3">
        <TilesSkeleton />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[7fr_5fr]">
          <CardSkeleton chart rows={0} />
          <CardSkeleton rows={6} />
        </div>
        <CardSkeleton rows={8} />
      </div>
    );
  }

  const { totals, previous } = data;
  const hasPrev = !!previous;
  const avg = totals.invoices ? totals.revenue / totals.invoices : 0;
  const prevAvg = totals.prevInvoices ? (totals.prevRevenue ?? 0) / totals.prevInvoices : null;
  const active = current ? current.rows.filter((r) => r.revenue > 0.004).length : null;
  const prevActive = current && hasPrev ? current.rows.filter((r) => (r.prevRevenue ?? 0) > 0.004).length : null;
  const maxShare = Math.max(0, ...(current?.rows ?? []).map((r) => r.share));
  const visible = showAll || search ? sorted : sorted.slice(0, PAGE);
  const range = { from: filters.dateFrom, to: filters.dateTo };
  const showGrowth = columns === 'growth' && hasPrev;
  const showProfit = columns === 'profit';
  const compareText = previous ? `${rangeLabel(filters.dateFrom, filters.dateTo)} vs ${rangeLabel(previous.from, previous.to)}` : `${rangeLabel(filters.dateFrom, filters.dateTo)} · pick a date range to compare with the period before`;

  function exportCsv() {
    const header = [
      dim.noun,
      'Detail',
      'Net sales',
      'Share %',
      ...(hasPrev ? ['Previous period', 'Growth %'] : []),
      'Cost',
      'Gross profit',
      'Margin %',
      'Lines without cost',
      'Quantity',
      'Invoices',
      ...(hasPrev ? ['Previous invoices'] : []),
    ];
    downloadCsv(
      `sales-by-${by}`,
      range,
      header,
      sorted.map((r) => [
        r.name,
        r.sub,
        r.revenue,
        Math.round(r.share * 1000) / 10,
        ...(hasPrev ? [r.prevRevenue, r.isNew ? 'New' : r.growth === null ? null : Math.round(r.growth * 1000) / 10] : []),
        r.cost,
        r.profit,
        r.margin === null ? null : Math.round(r.margin * 1000) / 10,
        r.costUnknownLines,
        r.qtyLabel,
        r.invoices,
        ...(hasPrev ? [r.prevInvoices] : []),
      ])
    );
  }

  const nothing = totals.revenue === 0 && (totals.prevRevenue ?? 0) === 0 && (current?.rows.length ?? 1) === 0;

  return (
    <Refreshing busy={isPlaceholderData && !!current}>
      <div className="mb-3.5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile icon={<TrendingUp size={14} />} label="Net sales (taxable)" value={money(totals.revenue)} badge={<ChangeBadge current={totals.revenue} previous={totals.prevRevenue} />} sub={hasPrev ? `${money(totals.prevRevenue ?? 0)} before` : undefined} />
        <StatTile icon={<ReceiptText size={14} />} label="Invoices" value={totals.invoices.toLocaleString('en-IN')} badge={<ChangeBadge current={totals.invoices} previous={totals.prevInvoices} />} sub={hasPrev ? `${totals.prevInvoices} before` : undefined} />
        <StatTile icon={<FileText size={14} />} label="Average invoice" value={money(avg)} badge={<ChangeBadge current={avg} previous={prevAvg} />} sub={prevAvg !== null ? `${money(prevAvg)} before` : undefined} />
        <StatTile
          icon={by === 'customer' ? <Users size={14} /> : by === 'product' ? <Package size={14} /> : <Layers size={14} />}
          label={dim.plural}
          value={active === null ? '—' : active.toLocaleString('en-IN')}
          badge={active !== null ? <ChangeBadge current={active} previous={prevActive} /> : undefined}
          sub={prevActive !== null ? `${prevActive} before` : undefined}
        />
      </div>

      {nothing ? (
        <ReportCard icon={<TrendingUp size={13} className="text-brand" />} title="Sales">
          <EmptyState icon={<TrendingUp size={16} />}>No sales in this period{hasPrev ? ' or the one before it' : ''}. Try a wider date range.</EmptyState>
        </ReportCard>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[7fr_5fr]">
            <ReportCard icon={<CalendarDays size={13} className="text-brand" />} title="Sales by day of the week" sub="Average taxable value billed per day — busy and quiet days at a glance">
              {weekdays ? (
                <ColumnChart
                  label="Average sales by day of the week"
                  data={weekdays.map((w) => ({
                    key: String(w.dow),
                    label: w.label,
                    value: w.average,
                    detail: `${money(w.revenue)} over ${w.days} ${w.label}${w.days === 1 ? '' : 's'} · ${w.invoices} invoice${w.invoices === 1 ? '' : 's'}`,
                  }))}
                  format={money}
                  formatAxis={(n) => fmtCompactMoney(n, currency)}
                  emptyText="No invoices in this period."
                />
              ) : (
                <Skeleton className="h-[170px] w-full" />
              )}
            </ReportCard>
            <Movers rows={current?.rows} hasPrev={hasPrev} noun={dim.noun.toLowerCase()} money={money} />
          </div>

          <ReportCard
            icon={<TrendingUp size={13} className="text-brand" />}
            title={`Sales by ${dim.noun.toLowerCase()}`}
            sub={compareText}
            action={
              <>
                <Segmented
                  label="Group sales by"
                  value={by}
                  options={DIMENSIONS}
                  onChange={(v) => {
                    setBy(v);
                    setShowAll(false);
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!current || sorted.length === 0} title="Download this table as Excel (CSV)">
                  <Download size={13} /> CSV
                </Button>
              </>
            }
          >
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="relative w-full max-w-xs">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${dim.noun.toLowerCase()}s…`} className="h-8 pl-8 text-[12.5px]" aria-label={`Search ${dim.noun.toLowerCase()}s`} />
              </div>
              <Segmented
                label="Columns"
                value={columns}
                onChange={setColumns}
                options={[
                  { value: 'growth', label: 'Growth' },
                  { value: 'profit', label: 'Profit' },
                ]}
              />
            </div>

            {!current ? (
              <TableSkeleton rows={8} cols={6} />
            ) : sorted.length === 0 ? (
              <EmptyState icon={<Search size={16} />}>Nothing matches “{search}”.</EmptyState>
            ) : (
              <>
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <SortHead label={dim.noun} sortKey="name" sort={sort} onSort={toggle} firstDir="asc" />
                      <SortHead label="Net sales" sortKey="revenue" sort={sort} onSort={toggle} align="right" />
                      <TableHead className="w-[150px]">Share</TableHead>
                      {showGrowth && <SortHead label="Previous" sortKey="prev" sort={sort} onSort={toggle} align="right" />}
                      {showGrowth && <SortHead label="Growth" sortKey="growth" sort={sort} onSort={toggle} align="right" />}
                      {showProfit && <SortHead label="Cost" sortKey="cost" sort={sort} onSort={toggle} align="right" />}
                      {showProfit && <SortHead label="Profit" sortKey="profit" sort={sort} onSort={toggle} align="right" />}
                      {showProfit && <SortHead label="Margin" sortKey="margin" sort={sort} onSort={toggle} align="right" />}
                      <SortHead label="Qty" sortKey="qty" sort={sort} onSort={toggle} align="right" />
                      <SortHead label="Invoices" sortKey="invoices" sort={sort} onSort={toggle} align="right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="max-w-[260px]">
                          <div className="truncate font-bold text-ink">
                            {by === 'customer' && r.id ? (
                              <Link href={`/customers?open=${encodeURIComponent(r.id)}`} className="hover:text-brand hover:underline">
                                {r.name}
                              </Link>
                            ) : (
                              r.name
                            )}
                          </div>
                          {r.sub && <div className="truncate text-[11px] text-ink-faint">{r.sub}</div>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono font-bold text-ink">{money(r.revenue)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <InlineBar value={r.share} max={maxShare} />
                            <span className="w-11 flex-shrink-0 text-right font-mono text-[11.5px] text-ink-soft">{fmtPct(r.share)}</span>
                          </div>
                        </TableCell>
                        {showGrowth && <TableCell className="whitespace-nowrap text-right font-mono text-ink-soft">{money(r.prevRevenue ?? 0)}</TableCell>}
                        {showGrowth && (
                          <TableCell className="text-right">
                            <Growth growth={r.growth} isNew={r.isNew} />
                          </TableCell>
                        )}
                        {showProfit && <ProfitCells row={r} money={money} />}
                        <TableCell className="whitespace-nowrap text-right font-mono text-ink-soft">{r.qty > 0 ? r.qtyLabel : '—'}</TableCell>
                        <TableCell className="text-right font-mono text-ink-soft">
                          {r.invoices}
                          {showGrowth && r.prevInvoices !== null && <span className="ml-1 text-[11px] text-ink-faint">/ {r.prevInvoices}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {!search && (
                    <TableFooter>
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="text-ink">Total · {current.rows.length}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-ink">{money(totals.revenue)}</TableCell>
                        <TableCell />
                        {showGrowth && <TableCell className="whitespace-nowrap text-right font-mono text-ink-soft">{money(totals.prevRevenue ?? 0)}</TableCell>}
                        {showGrowth && (
                          <TableCell className="text-right">
                            <Growth growth={totals.prevRevenue && totals.prevRevenue > 0.004 ? (totals.revenue - totals.prevRevenue) / totals.prevRevenue : null} />
                          </TableCell>
                        )}
                        {showProfit && <ProfitCells row={totals} money={money} />}
                        <TableCell />
                        <TableCell className="text-right font-mono text-ink">
                          {totals.invoices}
                          {showGrowth && <span className="ml-1 text-[11px] font-normal text-ink-faint">/ {totals.prevInvoices}</span>}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
                {showProfit && totals.costUnknownLines > 0 && (
                  <p className="mt-2.5 flex items-start gap-1.5 rounded-sm2 bg-gold-soft px-2.5 py-1.5 text-[11.5px] leading-snug text-ink-body">
                    <Info size={13} className="mt-px flex-shrink-0 text-gold" />
                    <span>
                      Cost unknown for {totals.costUnknownLines} product{totals.costUnknownLines === 1 ? '' : 's'} ({money(totals.costUnknownRevenue)} of sales) — left out of cost and profit
                      rather than counted as free. Add purchase entries to see their profit.
                    </span>
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-faint">
                  <span>
                    Taxable value after discounts, less credit notes.{showGrowth ? ' Invoices: this period / previous.' : ''}
                    {showProfit && ' Cost at each product’s average purchase cost; profit is before tax.'}
                    {by !== 'product' && ' Qty adds up main units (boxes).'}
                  </span>
                  {!showAll && !search && sorted.length > PAGE && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                      Show all {sorted.length}
                    </Button>
                  )}
                </div>
              </>
            )}
          </ReportCard>
        </>
      )}
    </Refreshing>
  );
}

/** Cost · Profit · Margin cells for a row (or the totals). A row with
 * uncosted lines gets an info mark saying how much was left out, so a
 * flattering margin never hides that it's partial. */
function ProfitCells({ row, money }: { row: ProfitTotals; money: (n: number) => string }) {
  const partial = row.costUnknownLines > 0;
  const note = `Cost unknown for ${row.costUnknownLines} line${row.costUnknownLines === 1 ? '' : 's'} — ${money(row.costUnknownRevenue)} of sales left out`;
  return (
    <>
      <TableCell className="whitespace-nowrap text-right font-mono text-ink-soft">{row.cost === null ? '—' : money(row.cost)}</TableCell>
      <TableCell className={`whitespace-nowrap text-right font-mono font-bold ${row.profit !== null && row.profit < 0 ? 'text-red' : 'text-ink'}`}>
        <span className="inline-flex items-center gap-1">
          {partial && (
            <span title={note} aria-label={note} className="text-gold">
              <Info size={12} />
            </span>
          )}
          {row.profit === null ? '—' : money(row.profit)}
        </span>
      </TableCell>
      <TableCell className={`whitespace-nowrap text-right font-mono ${row.margin !== null && row.margin < 0 ? 'text-red' : 'text-ink-soft'}`}>{row.margin === null ? '—' : fmtPct(row.margin)}</TableCell>
    </>
  );
}

/** The biggest swings vs the previous period, in money — who's buying
 * more and who's dropped off, which a share-sorted table buries. */
function Movers({ rows, hasPrev, noun, money }: { rows?: SalesRow[]; hasPrev: boolean; noun: string; money: (n: number) => string }) {
  const title = 'Biggest changes';
  const icon = <ArrowUpRight size={13} className="text-brand" />;
  if (!rows) return <CardSkeleton rows={6} />;
  if (!hasPrev) {
    return (
      <ReportCard icon={icon} title={title}>
        <EmptyState icon={<CalendarDays size={16} />}>Pick a date range (like This month) to see which {noun}s grew or fell against the period before.</EmptyState>
      </ReportCard>
    );
  }
  const deltas = rows.map((r) => ({ r, delta: r.revenue - (r.prevRevenue ?? 0) })).filter((x) => Math.abs(x.delta) > 0.5);
  const up = deltas.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 4);
  const down = deltas.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 4);

  return (
    <ReportCard icon={icon} title={title} sub="Change in net sales vs the previous period">
      {up.length === 0 && down.length === 0 ? (
        <EmptyState>No change between the two periods.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <MoverList title="Growing" items={up} money={money} up />
          <MoverList title="Slipping" items={down} money={money} />
        </div>
      )}
    </ReportCard>
  );
}

function MoverList({ title, items, money, up = false }: { title: string; items: { r: SalesRow; delta: number }[]; money: (n: number) => string; up?: boolean }) {
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{title}</div>
      {items.length === 0 ? (
        <p className="text-[12px] text-ink-faint">None</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map(({ r, delta }) => (
            <li key={r.key} className="flex items-center gap-2 text-[12px]">
              <Icon size={13} className={`flex-shrink-0 ${up ? 'text-green' : 'text-red'}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink-soft" title={r.name}>
                {r.name}
              </span>
              <span className={`flex-shrink-0 font-mono font-bold ${up ? 'text-green' : 'text-red'}`}>
                {up ? '+' : '−'}
                {money(Math.abs(delta))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
