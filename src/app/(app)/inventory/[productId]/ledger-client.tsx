'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowLeft, Boxes, CalendarRange, Check, PackageX, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentUser } from '@/components/current-user';
import { FilterChips } from '@/components/inventory/filter-chips';
import { MovementBadge, SoftBadge, StockStatusBadge } from '@/components/inventory/stock-badges';
import { StockInSheet } from '@/components/inventory/stock-in-sheet';
import { AdjustSheet } from '@/components/inventory/adjust-sheet';
import { daysLeftText, expiryText, fmtDate, fmtPlainDate, formatDelta, isInvoiceReversal, packLabel, parseCount, smallUnit } from '@/components/inventory/stock-meta';
import { fmtInr, formatUnit } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { formatStock } from '@/lib/stock-units';
import { cn } from '@/lib/utils';
import { useSetLowStockLevel, useSetStockCount, useSetTrackStock, useStockLedger, type LedgerParams } from '@/hooks/use-inventory';
import type { LedgerMovement, LedgerTypeGroup, StockLedger, StockProduct } from '@/actions/inventory';

const GROUPS: { value: LedgerTypeGroup; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'Stock in' },
  { value: 'sale', label: 'Sales' },
  { value: 'return', label: 'Returns' },
  { value: 'adjust', label: 'Adjustments' },
];

const DEFAULT_PARAMS: LedgerParams = { type: 'all', dateFrom: '', dateTo: '', page: 1 };

export function LedgerClient({ productId, initialData }: { productId: string; initialData: StockLedger }) {
  const { isOwner } = useCurrentUser();
  const [type, setType] = useState<LedgerTypeGroup>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [stockInOpen, setStockInOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const setTrack = useSetTrackStock();

  useEffect(() => setPage(1), [type, dateFrom, dateTo]);

  const params: LedgerParams = { type, dateFrom, dateTo, page };
  const isDefault = JSON.stringify(params) === JSON.stringify(DEFAULT_PARAMS);
  const { data: fetched, isFetching } = useStockLedger(productId, params, isDefault ? initialData : undefined);
  const data = fetched ?? initialData;
  const { product, summary } = data;
  const tracked = product.trackStock;
  const ranged = !!(dateFrom || dateTo);
  const today = todayIst();

  async function stopTracking() {
    try {
      await setTrack.mutateAsync({ productId, on: false });
      toast.success(`Stopped tracking ${product.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStopOpen(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/inventory">
          <ArrowLeft size={14} /> Inventory
        </Link>
      </Button>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[16px] sm:text-[17px] font-extrabold leading-tight text-ink">{product.name}</h1>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] text-ink-soft">
            <span>{product.category}</span>
            <Dot />
            <span>
              Main unit: {formatUnit(product.unit)}
              {packLabel(product) ? ` · ${packLabel(product)}` : ''}
            </span>
            <Dot />
            {/* A span, not a label: Switch renders its own <label>. */}
            <span className="inline-flex items-center gap-2" title={tracked && !isOwner ? 'Only the owner can stop tracking' : undefined}>
              <Switch
                checked={tracked}
                disabled={setTrack.isPending || (tracked && !isOwner)}
                onChange={(e) => (e.target.checked ? setStartOpen(true) : setStopOpen(true))}
                aria-label="Track stock"
              />
              Track stock
            </span>
            {tracked && (
              <>
                <Dot />
                <AlertLevelEditor product={product} />
              </>
            )}
          </div>
        </div>
        <div className="md:text-right">
          <div className="font-mono text-[28px] font-extrabold leading-none text-ink">{tracked ? formatStock(product.stockQty, product) : '—'}</div>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-soft md:justify-end">
            <StockStatusBadge status={product.status} />
            {tracked && smallUnit(product) && (
              <span className="font-mono">
                {Math.round(product.stockQty * 1000) / 1000} {product.unit}
              </span>
            )}
          </div>
        </div>
      </div>

      {!tracked && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg2 border border-gold bg-gold-soft p-3">
          <PackageX size={18} className="flex-shrink-0 text-gold" />
          <div className="min-w-0 flex-1 text-[12.5px] text-ink-body">
            <b className="font-extrabold text-ink">Not tracked.</b> Invoices don’t check or take stock for this product. Count what’s in the freezer to start.
          </div>
          <Button size="sm" onClick={() => setStartOpen(true)}>
            Start tracking
          </Button>
        </div>
      )}

      <div className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6', isFetching && 'opacity-80')}>
        <SumCard label={ranged ? 'Opening (period)' : 'Opening'} value={formatStock(summary.opening, product)} />
        <SumCard label="Stock in" value={signed(summary.stockIn, product)} tone={summary.stockIn < 0 ? 'out' : 'in'} />
        <SumCard label="Returns" value={signed(summary.returns, product)} tone="in" />
        <SumCard label="Sold" value={summary.sold ? `−${formatStock(summary.sold, product)}` : formatStock(0, product)} tone="out" />
        <SumCard label="Write-offs" value={signed(summary.writeOffs, product)} tone={summary.writeOffs > 0 ? 'in' : 'out'} />
        <SumCard label={summary.isCurrent ? 'In stock now' : 'Closing'} value={formatStock(summary.closing, product)} dark />
      </div>

      <div className={cn('grid gap-3', data.batches.length > 0 && 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
        {data.batches.length > 0 && <BatchesCard data={data} today={today} />}
        <InsightsCard data={data} wide={data.batches.length === 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <FilterChips label="Movement type" options={GROUPS.map((g) => ({ ...g, count: data.groupCounts[g.value] }))} value={type} onChange={setType} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-sm2 border border-line bg-surface px-2 py-1 text-[12px] text-ink-soft">
            <CalendarRange size={13} className="text-ink-faint" />
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" className="bg-transparent font-mono text-[12px] text-ink outline-none" />
            <span>–</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" className="bg-transparent font-mono text-[12px] text-ink outline-none" />
            {ranged && (
              <button
                type="button"
                aria-label="Clear dates"
                className="rounded-sm2 p-0.5 text-ink-faint hover:text-ink"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" disabled={!tracked} onClick={() => setStockInOpen(true)}>
            <ArrowDownToLine size={13} /> Stock in
          </Button>
          <Button variant="outline" size="sm" disabled={!tracked} onClick={() => setAdjustOpen(true)}>
            <SlidersHorizontal size={13} /> Adjust
          </Button>
        </div>
      </div>

      <div className={cn('shadow-card transition-opacity', isFetching && 'opacity-70')}>
        {data.movements.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl2 border border-line bg-surface py-12 text-center text-ink-faint">
            <Boxes size={28} />
            <p className="text-[13px] font-bold text-ink-soft">{type === 'all' && !ranged ? 'No stock movements yet.' : 'No movements match these filters.'}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-ink-soft">{fmtDate(m.date)}</TableCell>
                  <TableCell>
                    <MovementBadge type={m.type} reversal={isInvoiceReversal(m)} />
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <ReferenceCell m={m} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-green">{m.qty > 0 ? `+${formatStock(m.qty, product)}` : ''}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-red">{m.qty < 0 ? `−${formatStock(-m.qty, product)}` : ''}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono font-bold text-ink">{formatStock(m.balanceAfter, product)}</TableCell>
                  <TableCell className="min-w-[140px] text-[11.5px] text-ink-faint">{noteText(m, product) || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-[11.5px] text-ink-faint">{m.userName ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <Pagination page={page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />

      <StockInSheet open={stockInOpen} onOpenChange={setStockInOpen} product={product} />
      <AdjustSheet open={adjustOpen} onOpenChange={setAdjustOpen} product={product} />
      <StartTrackingDialog open={startOpen} onOpenChange={setStartOpen} product={product} />
      <ConfirmDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        title="Stop tracking stock?"
        description={
          <>
            Invoices will stop checking and taking stock for <b className="font-bold text-ink">{product.name}</b>. Its history is kept. To start again you’ll
            enter a fresh count.
          </>
        }
        confirmLabel="Stop tracking"
        pending={setTrack.isPending}
        onConfirm={stopTracking}
      />
    </div>
  );
}

function Dot() {
  return <span className="text-ink-faint">·</span>;
}

function signed(n: number, p: StockProduct) {
  if (Math.abs(n) < 1e-6) return formatStock(0, p);
  return formatDelta(n, p);
}

function SumCard({ label, value, tone, dark }: { label: string; value: string; tone?: 'in' | 'out'; dark?: boolean }) {
  return (
    <div className={cn('rounded-lg2 border px-3 py-2.5', dark ? 'border-ink bg-ink' : 'border-line bg-surface shadow-card')}>
      <div className={cn('text-[11px] font-semibold', dark ? 'text-surface/75' : 'text-ink-faint')}>{label}</div>
      <div
        className={cn(
          'mt-0.5 truncate font-mono text-[15px] font-extrabold',
          dark ? 'text-surface' : tone === 'in' ? 'text-green' : tone === 'out' ? 'text-red' : 'text-ink'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ReferenceCell({ m }: { m: LedgerMovement }) {
  const link = 'font-mono text-[12px] font-bold text-brand-dark hover:underline';
  if (m.invoiceId || m.invoiceNumber) {
    return (
      <div className="min-w-0">
        {m.invoiceId ? (
          <Link href={`/invoices/${m.invoiceId}`} className={link}>
            {m.invoiceNumber ?? 'Invoice'}
          </Link>
        ) : (
          <span className="font-mono text-[12px] text-ink-soft">{m.invoiceNumber} (deleted)</span>
        )}
        {m.customerName && <div className="truncate text-[11px] text-ink-faint">{m.customerName}</div>}
      </div>
    );
  }
  if (m.purchaseId) {
    return (
      <div className="min-w-0">
        <Link href={`/purchases/${m.purchaseId}`} className={link}>
          {m.reference ? `Bill ${m.reference}` : 'Purchase'}
        </Link>
        {m.supplierName && <div className="truncate text-[11px] text-ink-faint">{m.supplierName}</div>}
      </div>
    );
  }
  if (m.creditNoteId) {
    return (
      <Link href={`/credit-notes/${m.creditNoteId}`} className={link}>
        {m.creditNoteNumber ?? 'Credit note'}
      </Link>
    );
  }
  if (m.reference) {
    const isBill = m.type === 'PURCHASE' || m.type === 'PURCHASE_RETURN';
    return <span className="text-[12px] text-ink-soft">{isBill ? `Supplier bill ${m.reference}` : m.reference}</span>;
  }
  return <span className="text-ink-faint">—</span>;
}

function noteText(m: LedgerMovement, p: StockProduct) {
  return [
    m.note,
    m.batchNo ? `Batch ${m.batchNo}` : null,
    m.expiryDate ? `exp ${fmtPlainDate(m.expiryDate)}` : null,
    m.unitCost != null && m.qty > 0 ? `${fmtInr(m.unitCost)} / ${formatUnit(p.unit)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function BatchesCard({ data, today }: { data: StockLedger; today: string }) {
  const { product } = data;
  return (
    <div className="rounded-xl2 border border-line bg-surface shadow-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="text-[13px] font-extrabold text-ink">Batches on hand</div>
        <div className="text-[11px] text-ink-faint">Oldest stock assumed sold first</div>
      </div>
      <div className="divide-y divide-line">
        {data.batches.map((b, i) => {
          const exp = b.expiryDate ? expiryText(b.expiryDate, today, data.expiryAlertDays) : null;
          return (
            <div key={i} className="flex items-center gap-3 px-3.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12.5px] font-bold text-ink">{b.batchNo ?? 'No batch no.'}</div>
                <div className="text-[11px] text-ink-faint">Received {fmtDate(b.receivedAt)}</div>
              </div>
              {exp && (
                <SoftBadge className={exp.tone === 'red' ? 'bg-red-soft text-red' : exp.tone === 'gold' ? 'bg-gold-soft text-gold' : 'bg-surface-alt text-ink-soft'}>
                  {exp.text}
                </SoftBadge>
              )}
              <div className="w-[96px] flex-shrink-0 text-right font-mono text-[12.5px] font-bold text-ink">{formatStock(b.remaining, product)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Cost and days-of-stock figures for the product — what it's worth on the
 * shelf and when to order more. */
function InsightsCard({ data, wide }: { data: StockLedger; wide: boolean }) {
  const { product } = data;
  const tracked = product.trackStock;
  const value = data.avgCost != null && product.stockQty > 0 ? product.stockQty * data.avgCost : null;
  const items: { label: string; value: string; sub?: string; tone?: 'gold' }[] = [
    { label: 'Average cost', value: data.avgCost != null ? `${fmtInr(data.avgCost)} / ${formatUnit(product.unit)}` : '—', sub: data.avgCost == null ? 'Add a cost when stocking in' : 'From stock-ins with a cost' },
    { label: 'Stock value', value: value != null ? fmtInr(value) : '—', sub: value != null ? 'At average cost' : undefined },
    {
      label: 'Selling',
      value: data.avgDailySales > 0 ? `${formatStock(data.avgDailySales, product)} / day` : '—',
      sub: data.avgDailySales > 0 ? 'Last 30 days' : 'No sales in 30 days',
    },
    {
      label: 'Days left',
      value: tracked ? daysLeftText(data.daysLeft) : '—',
      sub: tracked && data.daysLeft != null && data.daysLeft <= data.reorderLeadDays && data.suggestedReorder ? `Reorder ~${formatStock(data.suggestedReorder, product)}` : undefined,
      tone: tracked && data.daysLeft != null && data.daysLeft <= data.reorderLeadDays ? 'gold' : undefined,
    },
  ];
  return (
    <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
      <div className={cn('grid gap-3', wide ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <div className="text-[11px] font-semibold text-ink-faint">{it.label}</div>
            <div className={cn('truncate font-mono text-[14px] font-extrabold', it.tone === 'gold' ? 'text-gold' : 'text-ink')}>{it.value}</div>
            {it.sub && <div className="truncate text-[10.5px] text-ink-faint">{it.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Alert at [5] Box" — saved when the box is left or Enter is pressed;
 * emptying it turns the low-stock alert off. */
function AlertLevelEditor({ product }: { product: StockProduct }) {
  const setLevel = useSetLowStockLevel();
  const current = product.lowStockAt == null ? '' : String(product.lowStockAt);
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);

  async function save() {
    const t = text.trim();
    const level = t === '' ? null : Number(t);
    if (level != null && (!Number.isFinite(level) || level < 0)) {
      toast.error('Enter the alert level as a number, or leave it empty to turn the alert off.');
      return setText(current);
    }
    if ((level ?? null) === (product.lowStockAt ?? null)) return;
    try {
      await setLevel.mutateAsync({ productId: product.id, level });
      toast.success(level == null ? 'Low-stock alert off' : `Alert at ${formatStock(level, product)}`);
    } catch (e) {
      toast.error((e as Error).message);
      setText(current);
    }
  }

  return (
    <label className="inline-flex items-center gap-1.5">
      Alert at
      <input
        value={text}
        inputMode="decimal"
        placeholder="—"
        aria-label={`Low-stock alert level in ${product.unit}`}
        disabled={setLevel.isPending}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-7 w-14 rounded-sm2 border border-border bg-surface px-2 text-right font-mono text-[12px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {formatUnit(product.unit)}
    </label>
  );
}

/** Switching tracking on always starts from a real count, never from
 * whatever balance was left over from before. */
function StartTrackingDialog({ open, onOpenChange, product }: { open: boolean; onOpenChange: (open: boolean) => void; product: StockProduct }) {
  const setCount = useSetStockCount();
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const value = parseCount(text, product);
  const pieces = smallUnit(product);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value == null) return;
    try {
      await setCount.mutateAsync({ productId: product.id, counted: value });
      toast.success(`Tracking ${product.name} from ${formatStock(value, product)}`);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Start tracking stock</DialogTitle>
            <p className="text-[12.5px] text-ink-soft">How much of {product.name} is in the freezer right now?</p>
          </DialogHeader>
          <div>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={text}
                inputMode="decimal"
                placeholder="0"
                aria-label={`Current stock in ${product.unit}`}
                onChange={(e) => setText(e.target.value)}
                className="h-9 w-32 rounded-sm2 border border-border bg-surface px-3 text-right font-mono text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-[12.5px] text-ink-soft">{value != null && pieces ? formatStock(value, product) : formatUnit(product.unit)}</span>
            </div>
            {pieces && <p className="mt-1.5 text-[11px] text-ink-faint">Loose pieces after a plus: 4+6 is 4 {product.unit} and 6 {pieces}.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={value == null || setCount.isPending}>
              <Check size={13} /> {setCount.isPending ? 'Saving…' : 'Start tracking'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
