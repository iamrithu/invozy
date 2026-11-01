'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetIcon, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { formatUnit } from '@/lib/gst';
import { formatStock, round6, unitFactor } from '@/lib/stock-units';
import { useAddStockMovement, useSetStockCount } from '@/hooks/use-inventory';
import type { StockProduct } from '@/actions/inventory';
import { ConvertNote, QtyUnitInput } from './qty-unit-input';
import { formatCountInput, formatDelta, parseCount, smallUnit } from './stock-meta';

type Reason = 'damage' | 'count' | 'return';

const REASONS: { value: Reason; label: string }[] = [
  { value: 'damage', label: 'Damaged / expired' },
  { value: 'count', label: 'Count correction' },
  { value: 'return', label: 'Customer return' },
];

/** "Adjust or write off" drawer on a product's ledger. Three reasons, three
 * different entries: a write-off (DAMAGE) can't take stock below zero; a
 * count correction sets the counted number whatever the books said (an
 * ADJUSTMENT for the difference); a customer return adds the goods back
 * (SALE_RETURN). */
export function AdjustSheet({ open, onOpenChange, product }: { open: boolean; onOpenChange: (open: boolean) => void; product: StockProduct }) {
  const add = useAddStockMovement();
  const setCount = useSetStockCount();
  const [reason, setReason] = useState<Reason>('damage');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState(product.unit);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason('damage');
    setQty('');
    setUnit(product.unit);
    setCounted(formatCountInput(product.stockQty, product));
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product.id]);

  const stock = product.stockQty;
  const n = Number(qty);
  const qtyValid = qty.trim() !== '' && Number.isFinite(n) && n > 0;
  const mainQty = qtyValid ? round6(n * unitFactor(product, unit)) : 0;
  const isMainUnit = unit.trim().toLowerCase() === product.unit.trim().toLowerCase();
  const countValue = parseCount(counted, product);
  const tooMuch = reason === 'damage' && qtyValid && mainQty > stock + 1e-6;
  const pending = add.isPending || setCount.isPending;
  const pieces = smallUnit(product);

  const canSubmit =
    reason === 'count' ? countValue != null && Math.abs(countValue - stock) > 1e-6 : qtyValid && !tooMuch;

  const amountText = qtyValid ? `${formatStock(mainQty, product)}${!isMainUnit ? ` (${n} ${formatUnit(unit)})` : ''}` : '';
  const submitLabel =
    reason === 'count' ? 'Save count' : !qtyValid ? (reason === 'damage' ? 'Write off' : 'Add back') : reason === 'damage' ? `Write off ${formatStock(mainQty, product)}` : `Add back ${formatStock(mainQty, product)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      if (reason === 'count') {
        await setCount.mutateAsync({ productId: product.id, counted: countValue!, note: note.trim() || 'Count correction' });
        toast.success(`${product.name} set to ${formatStock(countValue!, product)}`);
      } else {
        await add.mutateAsync({
          productId: product.id,
          input: { type: reason === 'damage' ? 'DAMAGE' : 'SALE_RETURN', qty: n, unit, note: note.trim() || null },
        });
        toast.success(reason === 'damage' ? `Wrote off ${formatStock(mainQty, product)}` : `Added back ${formatStock(mainQty, product)}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form onSubmit={submit} className="contents">
          <SheetHeader>
            <SheetIcon>
              <SlidersHorizontal size={16} />
            </SheetIcon>
            <div className="min-w-0 flex-1">
              <SheetTitle>Adjust or write off</SheetTitle>
              <p className="truncate text-[11.5px] text-ink-faint">
                {product.name} · {formatStock(stock, product)} in stock
              </p>
            </div>
          </SheetHeader>

          <SheetBody className="space-y-3.5">
            <div>
              <Label>Reason</Label>
              <div role="group" aria-label="Reason" className="grid grid-cols-3 gap-1 rounded-sm2 bg-surface-alt p-1">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={reason === r.value}
                    onClick={() => setReason(r.value)}
                    className={cn(
                      'rounded-sm2 px-2 py-1.5 text-[12px] font-bold transition-colors',
                      reason === r.value ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {reason === 'count' ? (
              <div>
                <Label htmlFor="adjust-count">Counted stock ({product.unit})</Label>
                <input
                  id="adjust-count"
                  value={counted}
                  inputMode="decimal"
                  onChange={(e) => setCounted(e.target.value)}
                  className={cn(
                    'h-9 w-full rounded-sm2 border border-border bg-surface px-3 font-mono text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20',
                    counted.trim() && countValue == null && 'border-destructive'
                  )}
                />
                {pieces && <p className="mt-1 text-[11px] text-ink-faint">Loose pieces after a plus: 4+6 is 4 {product.unit} and 6 {pieces}.</p>}
                {countValue != null && (
                  <ConvertNote>
                    {Math.abs(countValue - stock) < 1e-6
                      ? `Same as the books: ${formatStock(stock, product)}.`
                      : `Sets stock to ${formatStock(countValue, product)} (${formatDelta(countValue - stock, product)} on the books).`}
                  </ConvertNote>
                )}
              </div>
            ) : (
              <div>
                <Label htmlFor="adjust-qty">Quantity</Label>
                <QtyUnitInput id="adjust-qty" product={product} qty={qty} unit={unit} onQtyChange={setQty} onUnitChange={setUnit} invalid={tooMuch} />
                {qtyValid &&
                  (tooMuch ? (
                    <ConvertNote tone="error">
                      <span className="flex items-start gap-1.5">
                        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                        That’s more than you have ({formatStock(stock, product)}). Use “Count correction” to set the real count instead.
                      </span>
                    </ConvertNote>
                  ) : (
                    <ConvertNote>
                      {reason === 'damage' ? 'Removes' : 'Adds back'} {amountText}. New stock:{' '}
                      {formatStock(reason === 'damage' ? stock - mainQty : stock + mainQty, product)}.
                    </ConvertNote>
                  ))}
                {reason === 'return' && (
                  <p className="mt-1.5 text-[11px] text-ink-faint">Raising a credit note for this return? It adds the stock back by itself — don’t add it here too.</p>
                )}
              </div>
            )}

            <Field
              label={reason === 'damage' ? 'Note' : 'Note (optional)'}
              name="adjust-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={reason === 'damage' ? 'e.g. Freezer door left open overnight' : reason === 'count' ? 'e.g. Month-end count' : 'e.g. Returned by the shop, unopened'}
            />
          </SheetBody>

          <SheetFooter className="justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || pending}>
              <Check size={13} /> {pending ? 'Saving…' : submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
