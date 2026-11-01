'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownToLine, RotateCcw, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLastOrder, type LastOrder } from '@/actions/invoices';
import { fmtInr, formatUnit } from '@/lib/gst';

// The invoice builder's suggestions: fixes for short stock, a warning for
// lines priced below cost, and "same as last time" for a regular customer.
// Each shows what's wrong or on offer and the one tap that deals with it;
// the builder owns the lines and does the actual change.

export type ShortageFix = {
  productId: string;
  name: string;
  have: string;
  need: string;
  /** Bill what's in stock — set when the product is on exactly one line and
   * at least one of that line's unit is left. */
  fit: { lineId: string; qty: number; unit: string } | null;
  /** Nothing of it left — the one line it's on can only go. */
  removeLineId: string | null;
};

export function ShortagePanel({
  shortages,
  isOwner,
  busy,
  onSetQty,
  onRemoveLine,
  onAddStock,
  onSaveAnyway,
}: {
  shortages: ShortageFix[];
  isOwner: boolean;
  busy: boolean;
  onSetQty: (lineId: string, qty: number) => void;
  onRemoveLine: (lineId: string) => void;
  onAddStock: (productId: string) => void;
  onSaveAnyway: () => void;
}) {
  return (
    <div className="rounded-lg2 bg-red-soft px-3 py-2.5 text-[11.5px] text-ink-body">
      <div className="flex items-center gap-2">
        <AlertTriangle size={13} className="flex-shrink-0 text-red" />
        <b className="text-ink">Not enough stock for {shortages.length === 1 ? '1 item' : `${shortages.length} items`}</b>
      </div>
      <ul className="mt-2 space-y-2">
        {shortages.map((s) => (
          <li key={s.productId} className="rounded-sm2 bg-surface px-2.5 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="min-w-0 font-bold text-ink">{s.name}</span>
              <span className="text-ink-soft">
                need {s.need}, have <b className="text-red">{s.have}</b>
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {s.fit && (
                <Button type="button" size="sm" className="h-7 px-2.5 text-[11.5px]" onClick={() => onSetQty(s.fit!.lineId, s.fit!.qty)} disabled={busy}>
                  Bill {s.fit.qty} {formatUnit(s.fit.unit)}
                </Button>
              )}
              {s.removeLineId && (
                <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-[11.5px]" onClick={() => onRemoveLine(s.removeLineId!)} disabled={busy}>
                  Remove line
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11.5px]" onClick={() => onAddStock(s.productId)} disabled={busy}>
                <ArrowDownToLine size={11} /> Add stock
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {isOwner ? (
          <>
            <Button type="button" variant="outline" size="sm" className="h-7 bg-surface px-2.5 text-[11.5px]" onClick={onSaveAnyway} disabled={busy}>
              Save anyway
            </Button>
            <span className="text-ink-soft">if the count is wrong and the goods are there.</span>
          </>
        ) : (
          <span className="text-ink-soft">If the stock count is wrong, ask the owner to save it.</span>
        )}
      </div>
    </div>
  );
}

export type BelowCostLine = { lineId: string; name: string; unit: string; net: number; cost: number };

/** Owner only (costs come from getCostsForBilling, which gives staff
 * nothing) — a heads-up, never a block: selling at a loss is sometimes on
 * purpose. */
export function BelowCostPanel({ lines, currency }: { lines: BelowCostLine[]; currency?: string }) {
  return (
    <div className="rounded-lg2 bg-gold-soft px-3 py-2.5 text-[11.5px] text-ink-body">
      <div className="flex items-center gap-2">
        <TrendingDown size={13} className="flex-shrink-0 text-gold" />
        <b className="text-ink">Priced below cost</b>
      </div>
      <ul className="mt-1.5 space-y-1">
        {lines.map((l) => (
          <li key={l.lineId} className="flex flex-wrap justify-between gap-x-2">
            <span className="min-w-0 font-semibold text-ink">{l.name}</span>
            <span className="text-ink-soft">
              {fmtInr(l.net, currency)} per {formatUnit(l.unit)} after discount · cost <b className="text-ink">{fmtInr(l.cost, currency)}</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** "Same as last time?" — a regular customer's previous invoice, one tap
 * to bill it again at today's prices. Any shortage then shows in the
 * ShortagePanel with its own fixes. */
export function LastOrderCard({
  customerId,
  excludeInvoiceId,
  currency,
  onRepeat,
  onDismiss,
}: {
  customerId: string;
  excludeInvoiceId?: string;
  currency?: string;
  onRepeat: (order: LastOrder) => void;
  onDismiss: () => void;
}) {
  const { data: order } = useQuery({
    queryKey: ['invoices', 'last-order', customerId, excludeInvoiceId ?? null],
    queryFn: () => getLastOrder(customerId, excludeInvoiceId),
    staleTime: 60_000,
  });
  if (!order || !order.items.length) return null;
  const shown = order.items.slice(0, 3);
  return (
    <div className="rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">
        <RotateCcw size={11} className="text-brand" /> Same as last time?
      </div>
      <p className="text-[11.5px] text-ink-soft">
        {order.everyDays ? `Orders about every ${order.everyDays} day${order.everyDays === 1 ? '' : 's'} · ` : ''}last on {fmtDay(order.date)} (
        <span className="font-mono">{order.number}</span>)
      </p>
      <ul className="mt-1.5 space-y-0.5 text-[12px]">
        {shown.map((it) => (
          <li key={`${it.productId}|${it.unit}`} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">{it.name}</span>
            <b className="flex-shrink-0 font-mono text-ink">
              {it.qty} {formatUnit(it.unit)}
            </b>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11.5px] text-ink-faint">
        {order.items.length > shown.length ? `+ ${order.items.length - shown.length} more · ` : ''}
        {fmtInr(order.total, currency)} last time
      </p>
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" className="flex-1" onClick={() => onRepeat(order)}>
          <RotateCcw size={12} /> Repeat last order
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
