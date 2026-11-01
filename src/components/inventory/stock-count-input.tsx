'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatStock, needsPackSize, type UnitProduct } from '@/lib/stock-units';
import { useSetStockCount, useUndoStockCount } from '@/hooks/use-inventory';
import { formatCountInput, formatDelta, parseCount, smallUnit } from './stock-meta';

type CountableProduct = UnitProduct & { id: string; name: string; trackStock: boolean; stockQty: number };

/** The Inventory list's inline stock box. Typing a number and pressing
 * Enter (or leaving the box) records a physical count — the server posts an
 * Adjustment for the difference — and an 8-second toast offers Undo. For a
 * product that isn't tracked yet it starts as a "Start tracking" button; the
 * first count switches tracking on with an Opening entry.
 *
 * Counts are typed in the main unit, with loose pieces as "4+6" (4 Box and
 * 6 Pc) so nobody has to work out that 6 of 12 is 0.5. */
export function StockCountInput({ product, className }: { product: CountableProduct; className?: string }) {
  const setCount = useSetStockCount();
  const undoCount = useUndoStockCount();
  const inputRef = useRef<HTMLInputElement>(null);
  const [starting, setStarting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => (product.trackStock ? formatCountInput(product.stockQty, product) : ''));
  // Escape blurs the box too — this stops that blur from saving.
  const skipCommit = useRef(false);

  // Follow the server's balance (a sale, an undo, a refetch) unless the
  // person is mid-edit or a save is in flight.
  useEffect(() => {
    if (!focused && !setCount.isPending) setText(product.trackStock ? formatCountInput(product.stockQty, product) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.stockQty, product.trackStock]);

  useEffect(() => {
    if (starting) inputRef.current?.focus();
  }, [starting]);

  const parsed = parseCount(text, product);
  const pieces = smallUnit(product);
  const hint = pieces ? formatStock(parsed ?? product.stockQty, product) : product.unit;

  function reset() {
    setText(product.trackStock ? formatCountInput(product.stockQty, product) : '');
    setStarting(false);
  }

  async function commit() {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    const value = parseCount(text, product);
    if (!text.trim()) return reset();
    if (value == null) {
      toast.error(pieces ? `Type a count like 4, or 4+6 for 4 ${product.unit} and 6 ${pieces}.` : `Type a count in ${product.unit}, like 4 or 2.5.`);
      return reset();
    }
    if (product.trackStock && Math.abs(value - product.stockQty) < 1e-6) return reset();
    try {
      const res = await setCount.mutateAsync({ productId: product.id, counted: value });
      setStarting(false);
      if (!res.changed || res.balance == null || res.previous == null) return;
      const undo = { productId: product.id, previous: res.previous, counted: res.balance, startedTracking: !!res.startedTracking };
      toast.success(res.startedTracking ? `Tracking ${product.name}` : `${product.name} counted`, {
        description: res.startedTracking
          ? `Opening stock ${formatStock(res.balance, product)}. Sent and paid invoices now take from it.`
          : `Now ${formatStock(res.balance, product)} (${formatDelta(res.balance - res.previous, product)}), saved as a stock count.`,
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: () =>
            undoCount.mutate(undo, {
              onSuccess: () => toast.success(res.startedTracking ? 'Tracking switched off again' : 'Count undone'),
              onError: (e) => toast.error(e.message),
            }),
        },
      });
    } catch (e) {
      toast.error((e as Error).message);
      reset();
    }
  }

  if (!product.trackStock && !starting) {
    const blocked = needsPackSize(product);
    return (
      <div className={cn('flex flex-col items-start gap-0.5', className)}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={blocked}
          title={blocked ? `Set how many pieces are in one ${product.unit} first (Products → Edit)` : undefined}
          onClick={() => setStarting(true)}
        >
          <Plus size={13} /> Start tracking
        </Button>
        {blocked && <span className="text-[10.5px] text-ink-faint">Set pack size in Products first</span>}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          value={text}
          inputMode="decimal"
          aria-label={`Stock of ${product.name} in ${product.unit}`}
          placeholder={starting ? 'Count' : undefined}
          disabled={setCount.isPending}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            skipCommit.current = false;
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              skipCommit.current = true;
              reset();
              e.currentTarget.blur();
            }
          }}
          className={cn(
            'h-8 w-[84px] rounded-sm2 border border-border bg-surface px-2.5 text-right font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60',
            focused && text.trim() && parsed == null && 'border-destructive focus:border-destructive'
          )}
        />
        {setCount.isPending && <Loader2 size={12} className="absolute -right-4 top-1/2 -translate-y-1/2 animate-spin text-ink-faint" />}
      </div>
      <span className={cn('whitespace-nowrap text-[11.5px] text-ink-faint', setCount.isPending && 'pl-3')}>{hint}</span>
    </div>
  );
}
