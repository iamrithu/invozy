'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Boxes, Flame, PackageCheck, PackageMinus, PackageX, Snail, TriangleAlert, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarList } from '@/components/charts/bar-list';
import { StockStatusBadge } from '@/components/inventory/stock-badges';
import { daysLeftText } from '@/components/inventory/stock-meta';
import { CardSkeleton, EmptyState, Refreshing, ReportCard, Segmented, StatTile, TilesSkeleton } from '@/components/reports/report-ui';
import { fmtDay, fmtPct, rangeLabel } from '@/components/reports/format';
import { useInventoryInsights } from '@/hooks/use-reports';
import { fmtInr } from '@/lib/gst';
import type { ReportFilters } from '@/actions/reports';

type SlowWindow = '30' | '60' | '90';

/** Inventory: the stock side of the business for tracked products — what
 * the shelf is worth by category, what's selling fastest in the period,
 * what's been sitting unsold (money tied up), and what's about to run out.
 * Everything but the fast movers is a snapshot of stock as it is now. */
export function InventoryTab({ filters, currency }: { filters: ReportFilters; currency?: string }) {
  const { data, isPlaceholderData } = useInventoryInsights(filters);
  const [slowWindow, setSlowWindow] = useState<SlowWindow>('30');
  const money = (n: number) => fmtInr(n, currency);

  if (!data) {
    return (
      <div className="space-y-3">
        <TilesSkeleton />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <CardSkeleton rows={5} />
          <CardSkeleton rows={5} />
        </div>
        <CardSkeleton rows={6} />
      </div>
    );
  }

  if (data.tracked === 0) {
    return (
      <ReportCard icon={<Boxes size={13} className="text-brand" />} title="Inventory">
        <EmptyState
          icon={<Boxes size={16} />}
          action={
            <Button type="button" size="sm" asChild>
              <Link href="/inventory">Go to Inventory</Link>
            </Button>
          }
        >
          No products have stock tracking turned on yet. Track stock for your products on the Inventory screen to see stock value, fast and slow movers, and what&apos;s running low here.
        </EmptyState>
      </ReportCard>
    );
  }

  const minDays = Number(slowWindow);
  const slow = data.slowStock.filter((s) => s.daysSinceSale === null || s.daysSinceSale >= minDays);
  const slowValue = slow.reduce((s, x) => s + x.value, 0);

  return (
    <Refreshing busy={isPlaceholderData}>
      <div className="mb-3.5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile
          icon={<Warehouse size={14} />}
          label="Stock value"
          value={money(data.stockValue)}
          sub={data.valuedAtPrice ? `${data.valuedAtPrice} at selling price (no cost on file)` : 'At average purchase cost'}
        />
        <StatTile icon={<PackageCheck size={14} />} label="In stock" value={`${data.inStock} of ${data.tracked}`} sub="Tracked products with stock" />
        <StatTile icon={<PackageMinus size={14} />} label="Low stock" value={String(data.low)} tone={data.low ? 'red' : undefined} sub="At or below their alert level" />
        <StatTile icon={<PackageX size={14} />} label="Out of stock" value={String(data.out)} tone={data.out ? 'red' : undefined} sub="Nothing left to sell" />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ReportCard icon={<Warehouse size={13} className="text-brand" />} title="Stock value by category" sub="What's on the shelf now">
          <BarList
            emptyText="Nothing in stock right now."
            items={data.byCategory.map((c) => ({
              key: c.category,
              label: c.category,
              sub: `${c.products} product${c.products === 1 ? '' : 's'}`,
              value: c.value,
              valueLabel: money(c.value),
              note: fmtPct(c.share, 0),
            }))}
          />
        </ReportCard>
        <ReportCard icon={<Flame size={13} className="text-brand" />} title="Fast movers" sub={`Most sold, in main units · ${rangeLabel(filters.dateFrom, filters.dateTo)}`}>
          <BarList
            barClassName="bg-gold"
            emptyText="No tracked products sold in this period."
            items={data.fastMovers.map((f) => ({
              key: f.id,
              label: f.name,
              sub: f.stock <= 1e-6 ? 'out of stock' : `${f.stockLabel} left${f.daysLeft !== null ? ` · ${daysLeftText(f.daysLeft)}` : ''}`,
              value: f.qty,
              valueLabel: f.qtyLabel,
              href: `/inventory/${encodeURIComponent(f.id)}`,
            }))}
          />
        </ReportCard>
      </div>

      <ReportCard
        className="mb-3"
        icon={<Snail size={13} className="text-brand" />}
        title="Slow & dead stock"
        sub={slow.length ? `${money(slowValue)} tied up in ${slow.length} product${slow.length === 1 ? '' : 's'} with no sale in ${minDays}+ days` : `In-stock products with no sale in ${minDays}+ days`}
        action={
          <Segmented
            label="No sale in"
            value={slowWindow}
            onChange={setSlowWindow}
            options={[
              { value: '30', label: '30+ days' },
              { value: '60', label: '60+ days' },
              { value: '90', label: '90+ days' },
            ]}
          />
        }
      >
        {slow.length === 0 ? (
          <EmptyState icon={<PackageCheck size={16} />}>Everything in stock has sold in the last {minDays} days.</EmptyState>
        ) : (
          <Table className="min-w-[620px]">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Last sold</TableHead>
                <TableHead className="text-right">Days idle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slow.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-[260px]">
                    <Link href={`/inventory/${encodeURIComponent(s.id)}`} className="block truncate font-bold text-ink hover:text-brand hover:underline">
                      {s.name}
                    </Link>
                    <div className="truncate text-[11px] text-ink-faint">{s.category}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-ink-soft">{s.stockLabel}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono font-bold text-ink">{money(s.value)}</TableCell>
                  <TableCell className="whitespace-nowrap text-[12px] text-ink-soft">{s.lastSold ? fmtDay(s.lastSold) : <span className="text-red">Never sold</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-ink-soft">{s.daysSinceSale === null ? '—' : s.daysSinceSale}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ReportCard>

      <ReportCard
        icon={<TriangleAlert size={13} className="text-brand" />}
        title="Running low"
        sub={`Out, at their alert level, or due to run out within ${data.reorderLeadDays} days at the last ${data.salesWindowDays} days' sales rate`}
        action={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/inventory">Reorder on Inventory</Link>
          </Button>
        }
      >
        {data.runningLow.length === 0 ? (
          <EmptyState icon={<PackageCheck size={16} />}>Nothing is running low — every tracked product has enough stock for now.</EmptyState>
        ) : (
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">Alert at</TableHead>
                <TableHead className="text-right">Sells a day</TableHead>
                <TableHead className="text-right">Days left</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.runningLow.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[260px]">
                    <Link href={`/inventory/${encodeURIComponent(r.id)}`} className="block truncate font-bold text-ink hover:text-brand hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StockStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-ink-soft">{r.stockLabel}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-ink-faint">{r.alertLabel ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-ink-soft">{r.dailyLabel ?? '—'}</TableCell>
                  <TableCell className={`whitespace-nowrap text-right font-mono font-bold ${r.status === 'out' || (r.daysLeft !== null && r.daysLeft <= data.reorderLeadDays) ? 'text-red' : 'text-ink'}`}>
                    {r.status === 'out' ? '0' : daysLeftText(r.daysLeft)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ReportCard>
    </Refreshing>
  );
}
