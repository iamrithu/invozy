'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, Boxes, Clock, History, Plus, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonTable } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FilterChips } from '@/components/inventory/filter-chips';
import { StockStatusBadge } from '@/components/inventory/stock-badges';
import { StockCountInput } from '@/components/inventory/stock-count-input';
import { StockInSheet } from '@/components/inventory/stock-in-sheet';
import { MOVEMENT_META, SALE_REDUCED_META, STATUS_META, daysLeftText, expiryText, fmtDay, packLabel } from '@/components/inventory/stock-meta';
import { formatUnit } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { formatStock } from '@/lib/stock-units';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useProductCategories } from '@/hooks/use-products';
import { useInventoryPage } from '@/hooks/use-inventory';
import type { DraftsHoldingStock, InventoryPage, InventoryRow, InventoryStatusFilter } from '@/actions/inventory';

const PAGE_SIZE = 20;

const CHIPS: { value: InventoryStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'In stock' },
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out of stock' },
  { value: 'untracked', label: 'Not tracked' },
  { value: 'reorder', label: 'Reorder' },
  { value: 'expiring', label: 'Expiring' },
];

export function InventoryClient({
  initialData,
  initialStatus,
  drafts,
}: {
  initialData: InventoryPage;
  initialStatus: InventoryStatusFilter;
  drafts: DraftsHoldingStock;
}) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState<InventoryStatusFilter>(initialStatus);
  const [page, setPage] = useState(1);
  const [stockInFor, setStockInFor] = useState<InventoryRow | null>(null);
  const [stockInOpen, setStockInOpen] = useState(false);

  useEffect(() => setPage(1), [search, category, status]);

  const isSeedParams = search === '' && category === 'all' && status === initialStatus && page === 1;
  const params = { search, category, status, page, pageSize: PAGE_SIZE };
  const { data, isFetching, isLoading } = useInventoryPage(params, isSeedParams ? initialData : undefined);
  const { data: categories = [] } = useProductCategories();
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const counts = data?.counts ?? initialData.counts;
  const leadDays = data?.reorderLeadDays ?? initialData.reorderLeadDays;
  const alertDays = data?.expiryAlertDays ?? initialData.expiryAlertDays;
  const today = todayIst();

  // The drawer reads the row from the live list, so its "In stock" follows
  // a refetch while it's open.
  const stockInProduct = stockInFor ? (items.find((r) => r.id === stockInFor.id) ?? stockInFor) : null;

  function openStockIn(row: InventoryRow | null) {
    setStockInFor(row);
    setStockInOpen(true);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
            <Boxes size={18} className="text-brand" /> Inventory
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Counted in each product’s main unit. Every saved invoice, drafts included, takes stock out automatically.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/purchases">
              <ShoppingCart size={13} /> Purchases
            </Link>
          </Button>
          <Button onClick={() => openStockIn(null)}>
            <ArrowDownToLine size={13} /> Stock in
          </Button>
        </div>
      </div>

      {drafts.count > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl2 border border-line bg-gold-soft px-3.5 py-2.5 text-[12px] text-ink-body">
          <Clock size={14} className="flex-shrink-0 text-gold" />
          <p className="min-w-0 flex-1">
            <b className="font-extrabold text-ink">
              {drafts.count} draft{drafts.count === 1 ? ' is' : 's are'} holding stock
            </b>
            {drafts.oldestDate && <> — the oldest from {fmtDay(`${drafts.oldestDate}T00:00:00+05:30`)}</>} ({drafts.numbers.join(', ')}
            {drafts.count > drafts.numbers.length ? '…' : ''}). Send or delete them so these counts stay right.
          </p>
          <Button asChild size="sm" variant="outline" className="bg-surface">
            <Link href="/invoices?status=DRAFT">View drafts</Link>
          </Button>
        </div>
      )}

      <div className={cn('mb-4 space-y-2.5 rounded-xl2 border border-line bg-surface p-3.5 shadow-card transition-opacity', isFetching && 'opacity-70')}>
        <FilterChips label="Stock status" options={CHIPS.map((c) => ({ ...c, count: counts[c.value] }))} value={status} onChange={setStatus} />
        <div className="flex flex-wrap items-center gap-2.5">
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search products…" className="h-8 max-w-[260px] text-[12.5px]" />
          {categories.length > 0 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-[170px] text-[12px]" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {status === 'reorder' && (
          <p className="text-[11.5px] text-ink-faint">
            Will run out within {leadDays} days at the last 30 days’ sales rate. The suggested order covers {leadDays * 2} days of sales.
          </p>
        )}
        {status === 'expiring' && (
          <p className="text-[11.5px] text-ink-faint">Batches on hand that expire within {alertDays} days, assuming the oldest stock sells first.</p>
        )}
      </div>

      {isLoading ? (
        <SkeletonTable cols={6} />
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl2 border border-line bg-surface py-14 text-center text-ink-faint shadow-card">
          <Boxes size={32} />
          <p className="text-[13.5px] font-bold text-ink-soft">{status === 'all' && !search && category === 'all' ? 'No products yet.' : 'Nothing matches these filters.'}</p>
          {status === 'all' && !search && category === 'all' && (
            <Button asChild size="sm">
              <Link href="/products">
                <Plus size={13} /> Add products
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden shadow-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>In stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Days left</TableHead>
                  <TableHead className="text-right">Alert at</TableHead>
                  <TableHead>Last change</TableHead>
                  <TableHead className="text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id} className={cn(!p.active && 'opacity-70')}>
                    <TableCell className={cn('max-w-[260px]', STATUS_META[p.status].accent)}>
                      <Link href={`/inventory/${p.id}`} className="block truncate text-[13px] font-bold text-ink hover:text-brand">
                        {p.name}
                      </Link>
                      <div className="truncate text-[11px] text-ink-faint">
                        {[p.category, packLabel(p), !p.active ? 'Hidden' : null].filter(Boolean).join(' · ')}
                      </div>
                    </TableCell>
                    <TableCell className="text-ink-soft">{formatUnit(p.unit)}</TableCell>
                    <TableCell>
                      <StockCountInput product={p} />
                    </TableCell>
                    <TableCell>
                      <StatusCell row={p} today={today} alertDays={alertDays} />
                    </TableCell>
                    <TableCell>
                      <DaysLeftCell row={p} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-ink-soft">
                      {p.trackStock && p.lowStockAt != null ? formatStock(p.lowStockAt, p) : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[11.5px] text-ink-faint">{lastChange(p)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!p.trackStock}
                          title={p.trackStock ? 'Record stock received' : 'Start tracking first'}
                          onClick={() => openStockIn(p)}
                        >
                          <Plus size={13} /> Stock in
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/inventory/${p.id}`}>
                            <History size={13} /> History
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phone cards */}
          <div className="grid gap-2.5 md:hidden">
            {items.map((p) => (
              <div key={p.id} className={cn('space-y-2.5 rounded-xl2 border border-line bg-surface p-3 shadow-card', STATUS_META[p.status].cardAccent)}>
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <Link href={`/inventory/${p.id}`} className="block truncate text-[13px] font-bold text-ink">
                      {p.name}
                    </Link>
                    <div className="truncate text-[11px] text-ink-faint">{[p.category, packLabel(p)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <StatusCell row={p} today={today} alertDays={alertDays} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StockCountInput product={p} />
                  <div className="flex gap-1">
                    {p.trackStock && (
                      <Button type="button" size="sm" variant="outline" onClick={() => openStockIn(p)} aria-label={`Stock in ${p.name}`}>
                        <Plus size={13} /> In
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/inventory/${p.id}`}>
                        <History size={13} /> History
                      </Link>
                    </Button>
                  </div>
                </div>
                {p.trackStock && (p.daysLeft != null || p.lastMovementAt) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
                    {p.daysLeft != null && <DaysLeftCell row={p} inline />}
                    {p.lastMovementAt && <span>{lastChange(p)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <StockInSheet open={stockInOpen} onOpenChange={setStockInOpen} product={stockInProduct} />
    </div>
  );
}

function lastChange(p: InventoryRow) {
  if (!p.lastMovementAt || !p.lastMovementType) return '—';
  return `${fmtDay(p.lastMovementAt)} · ${(p.lastMovementReversal ? SALE_REDUCED_META : MOVEMENT_META[p.lastMovementType]).label}`;
}

function StatusCell({ row, today, alertDays }: { row: InventoryRow; today: string; alertDays: number }) {
  const exp = row.nextExpiry ? expiryText(row.nextExpiry, today, alertDays) : null;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <StockStatusBadge status={row.status} />
      {exp && <span className={cn('whitespace-nowrap text-[10.5px] font-bold', exp.tone === 'red' ? 'text-red' : 'text-gold')}>{exp.text}</span>}
    </div>
  );
}

/** Days of stock left at the 30-day sales rate; flagged (with how much to
 * order) once it's inside the reorder lead time. */
function DaysLeftCell({ row, inline }: { row: InventoryRow; inline?: boolean }) {
  if (!row.trackStock || row.daysLeft == null) return <span className="text-ink-faint">—</span>;
  const reorderText = row.reorder && row.suggestedReorder ? `Reorder ~${formatStock(row.suggestedReorder, row)}` : null;
  if (inline) {
    return (
      <span className={cn(row.reorder && 'font-bold text-gold')}>
        {daysLeftText(row.daysLeft)} left{reorderText ? ` · ${reorderText}` : ''}
      </span>
    );
  }
  return (
    <div className="whitespace-nowrap">
      <div className={cn('text-[12.5px] font-bold', row.reorder ? 'text-gold' : 'text-ink-soft')}>{daysLeftText(row.daysLeft)}</div>
      {reorderText && <div className="text-[10.5px] text-ink-faint">{reorderText}</div>}
    </div>
  );
}
