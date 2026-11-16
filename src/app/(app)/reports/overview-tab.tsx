'use client';

import { useState } from 'react';
import { ArrowRight, Landmark, Package, Percent, PieChart, PiggyBank, Receipt, TrendingUp, Users, Wallet } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { BillingTrendChart } from '@/components/charts/billing-trend-chart';
import { StatusBreakdownChart } from '@/components/charts/status-breakdown-chart';
import { TopProductsChart, TopProductsToggle, type TopProductsRank } from '@/components/charts/top-products-chart';
import { GstSummaryCard } from '@/components/reports/gst-summary-card';
import { ProfitCard } from '@/components/reports/profit-card';
import { ChangeBadge, Refreshing, ReportCard, StatTile, TableSkeleton, TilesSkeleton } from '@/components/reports/report-ui';
import {
  useReportStats,
  usePreviousPeriodStats,
  useBillingTrend,
  useTopCustomers,
  useStatusBreakdown,
  useTopProducts,
  useGstSummary,
  useProfitEstimate,
} from '@/hooks/use-reports';
import { fmtInr } from '@/lib/gst';
import { customerDisplayName } from '@/lib/customer';
import type { getReportStats, getBillingTrend, getTopCustomers, getStatusBreakdown, getTopProducts, getGstSummary, ReportFilters } from '@/actions/reports';

/** The all-time, unfiltered Overview figures page.tsx renders with, so the
 * default view paints immediately (only when the page opens on this tab). */
export type OverviewSeed = {
  stats: Awaited<ReturnType<typeof getReportStats>>;
  trend: Awaited<ReturnType<typeof getBillingTrend>>;
  topCustomers: Awaited<ReturnType<typeof getTopCustomers>>;
  statusBreakdown: Awaited<ReturnType<typeof getStatusBreakdown>>;
  topProducts: Awaited<ReturnType<typeof getTopProducts>>;
  gst: Awaited<ReturnType<typeof getGstSummary>>;
};

/** Customers listed here; the full, sortable list is on Sales analysis. */
const TOP_CUSTOMERS = 8;

/** The Overview tab: headline figures with change vs the previous period,
 * the billing trend, tax and GST position, profit estimate, status split,
 * best sellers and best customers — what the Reports page always was. The
 * seed is only used while the filters are at their defaults (it IS the
 * default view); any other filter loads with skeletons first. */
export function OverviewTab({ filters, isDefault, seed, currency, onOpenSales }: { filters: ReportFilters; isDefault: boolean; seed?: OverviewSeed; currency?: string; onOpenSales: () => void }) {
  const s = isDefault ? seed : undefined;
  const { data: stats, isPlaceholderData } = useReportStats(filters, s?.stats);
  const { data: previousStats } = usePreviousPeriodStats(filters);
  const { data: trend } = useBillingTrend(filters, s?.trend);
  const { data: customers } = useTopCustomers(filters, s?.topCustomers);
  const { data: statuses } = useStatusBreakdown(filters, s?.statusBreakdown);
  const { data: products } = useTopProducts(filters, s?.topProducts);
  const { data: gst } = useGstSummary(filters, s?.gst);
  // Not server-seeded: it's the heaviest query here and sits below the
  // fold, so the page paints without waiting for it.
  const { data: profit } = useProfitEstimate(filters);
  const [productRank, setProductRank] = useState<TopProductsRank>('value');

  const money = (n: number) => fmtInr(n, currency);

  return (
    <Refreshing busy={isPlaceholderData}>
      {stats ? (
        <div className="mb-3.5 grid grid-cols-2 gap-2 md:grid-cols-5">
          <StatTile icon={<Receipt size={14} />} label="Taxable value" value={money(stats.taxable)} badge={<ChangeBadge current={stats.taxable} previous={previousStats?.taxable} />} />
          <StatTile
            icon={<Percent size={14} />}
            label="CGST + SGST"
            value={money(stats.cgst + stats.sgst)}
            badge={<ChangeBadge current={stats.cgst + stats.sgst} previous={previousStats ? previousStats.cgst + previousStats.sgst : undefined} />}
          />
          <StatTile icon={<Percent size={14} />} label="IGST" value={money(stats.igst)} badge={<ChangeBadge current={stats.igst} previous={previousStats?.igst} />} />
          <StatTile icon={<TrendingUp size={14} />} label="Total billed" value={money(stats.total)} badge={<ChangeBadge current={stats.total} previous={previousStats?.total} />} />
          <StatTile
            icon={<Wallet size={14} />}
            label="Outstanding"
            value={money(stats.outstanding)}
            badge={<ChangeBadge current={stats.outstanding} previous={previousStats?.outstanding} upIsGood={false} />}
          />
        </div>
      ) : (
        <TilesSkeleton count={5} className="mb-3.5 md:grid-cols-5" />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[7fr_5fr]">
        <ReportCard icon={<TrendingUp size={13} className="text-brand" />} title="Billing & collection trend">
          {trend ? <BillingTrendChart data={trend} /> : <Skeleton className="h-[176px] w-full" />}
        </ReportCard>

        <ReportCard icon={<Receipt size={13} className="text-brand" />} title="Tax composition">
          {!stats ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-[120px] w-[120px] flex-shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ) : stats.cgst + stats.sgst + stats.igst <= 0 ? (
            <p className="py-8 text-center text-[12.5px] text-ink-faint">No tax collected in this period.</p>
          ) : (
            <div className="flex items-center gap-4">
              <TaxDonut cgst={stats.cgst} sgst={stats.sgst} igst={stats.igst} currency={currency} />
              <div className="min-w-0 flex-1 space-y-1.5">
                {stats.cgst > 0 && <Legend color="hsl(var(--brand))" label="CGST" value={money(stats.cgst)} />}
                {stats.sgst > 0 && <Legend color="hsl(var(--gold))" label="SGST" value={money(stats.sgst)} />}
                {stats.igst > 0 && <Legend color="hsl(var(--green))" label="IGST" value={money(stats.igst)} />}
              </div>
            </div>
          )}
        </ReportCard>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[7fr_5fr]">
        <ReportCard icon={<Landmark size={13} className="text-brand" />} title="GST summary">
          {gst ? <GstSummaryCard data={gst} currency={currency} /> : <LinesSkeleton bar rows={5} />}
        </ReportCard>

        <ReportCard icon={<PiggyBank size={13} className="text-brand" />} title="Profit estimate">
          {profit ? <ProfitCard data={profit} currency={currency} /> : <ProfitSkeleton />}
        </ReportCard>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ReportCard icon={<PieChart size={13} className="text-brand" />} title="Status breakdown">
          {statuses ? <StatusBreakdownChart data={statuses} currency={currency} /> : <LinesSkeleton bar rows={4} />}
        </ReportCard>

        <ReportCard icon={<Package size={13} className="text-brand" />} title="Top products" action={<TopProductsToggle by={productRank} onChange={setProductRank} />}>
          {products ? <TopProductsChart data={products} by={productRank} currency={currency} /> : <LinesSkeleton rows={6} />}
        </ReportCard>
      </div>

      <ReportCard
        className="mt-3"
        icon={<Users size={13} className="text-brand" />}
        title="Top customers by billing"
        action={
          customers && customers.length > TOP_CUSTOMERS ? (
            <button type="button" onClick={onOpenSales} className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand hover:underline">
              All {customers.length} in Sales analysis <ArrowRight size={12} />
            </button>
          ) : undefined
        }
      >
        {!customers ? (
          <TableSkeleton rows={5} />
        ) : customers.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-ink-faint">No billing data in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Total billed</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.slice(0, TOP_CUSTOMERS).map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-bold text-ink">{customerDisplayName(c)}</TableCell>
                  <TableCell className="text-ink-soft">{c.state}</TableCell>
                  <TableCell className="text-right font-mono text-ink-soft">{c.count}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono font-bold">{money(c.total)}</TableCell>
                  <TableCell className={`whitespace-nowrap text-right font-mono font-bold ${c.balance > 0 ? 'text-red' : 'text-green'}`}>{money(c.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ReportCard>
    </Refreshing>
  );
}

function LinesSkeleton({ rows, bar = false }: { rows: number; bar?: boolean }) {
  return (
    <div>
      {bar && <Skeleton className="mb-3 h-9 w-full" />}
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-full" />
        ))}
      </div>
    </div>
  );
}

function ProfitSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[46px] w-full" />
        ))}
      </div>
      <div className="mt-3 space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
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
