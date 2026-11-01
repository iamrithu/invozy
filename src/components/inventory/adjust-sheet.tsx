'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { FormField, FormGrid, FormSection, FormSheet, Segmented, Tag, invalidClass } from '@/components/ui/form-sheet';
import { cn } from '@/lib/utils';
import { formatUnit } from '@/lib/gst';
import { formatStock, round6, unitFactor } from '@/lib/stock-units';
import { useAddStockMovement, useSetStockCount } from '@/hooks/use-inventory';
import type { StockProduct } from '@/actions/inventory';
import { QtyUnitInput } from './qty-unit-input';
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

  const canSubmit = reason === 'count' ? countValue != null && Math.abs(countValue - stock) > 1e-6 : qtyValid && !tooMuch;

  const amountText = qtyValid ? `${formatStock(mainQty, product)}${!isMainUnit ? ` (${n} ${formatUnit(unit)})` : ''}` : '';
  const submitLabel =
    reason === 'count' ? 'Save count' : !qtyValid ? (reason === 'damage' ? 'Write off' : 'Add back') : reason === 'damage' ? `Write off ${formatStock(mainQty, product)}` : `Add back ${formatStock(mainQty, product)}`;
  const after = reason === 'count' ? countValue : !qtyValid || tooMuch ? null : reason === 'damage' ? stock - mainQty : stock + mainQty;
  const qtyIssue = reason === 'count' ? (counted.trim() && countValue == null ? 'Counted stock' : null) : tooMuch ? 'Quantity' : null;

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

  const sections = [
    { id: 'reason', label: 'Reason', done: true },
    { id: 'qty', label: reason === 'count' ? 'Count' : 'Quantity', done: canSubmit, issues: qtyIssue ? 1 : 0 },
    { id: 'note', label: 'Note', done: !!note.trim() },
  ];

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      icon={<SlidersHorizontal size={18} />}
      title="Adjust stock"
      subtitle={`Inventory · ${product.name}`}
      onSubmit={submit}
      sections={sections}
      progress={`${formatStock(stock, product)} in stock`}
      preview={{
        caption: 'what this changes',
        content: (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1 basis-40">
              <div className="truncate text-[14px] font-bold text-ink">{product.name}</div>
              <div className="mt-0.5 text-[12px] text-ink-soft">{REASONS.find((r) => r.value === reason)?.label}</div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[13px]">
              <span className="text-ink-soft">{formatStock(stock, product)}</span>
              <ArrowRight size={14} className="text-ink-faint" />
              <span className={cn('font-bold', after == null ? 'text-ink-faint' : 'text-ink')}>{after == null ? '—' : formatStock(after, product)}</span>
            </div>
            {after != null && Math.abs(after - stock) > 1e-6 && (
              <div className="flex basis-full">
                <Tag tone={after < stock ? 'red' : 'green'}>{formatDelta(after - stock, product)}</Tag>
              </div>
            )}
          </div>
        ),
      }}
      submitLabel={submitLabel}
      pending={pending}
      submitDisabled={!canSubmit}
      issues={qtyIssue ? [qtyIssue] : []}
    >
      <FormSection id="reason" n={1} title="Reason" aside="Each is recorded differently" done>
        <Segmented label="Reason" value={reason} onChange={setReason} options={REASONS} className="max-sm:!grid-cols-1" />
      </FormSection>

      <FormSection id="qty" n={2} title={reason === 'count' ? 'Count' : 'Quantity'} aside={reason === 'count' ? 'What’s really there now' : `Any unit — converted to ${formatUnit(product.unit)}`} done={canSubmit}>
        <FormGrid>
          {reason === 'count' ? (
            <FormField
              label={`Counted stock (${product.unit})`}
              required
              htmlFor="adjust-count"
              span={4}
              error={counted.trim() && countValue == null ? `Enter a number${pieces ? `, or ${product.unit} + ${pieces} like 4+6` : ''}.` : undefined}
              help={
                countValue != null
                  ? Math.abs(countValue - stock) < 1e-6
                    ? `Same as the books: ${formatStock(stock, product)}.`
                    : `Sets stock to ${formatStock(countValue, product)} (${formatDelta(countValue - stock, product)} on the books).`
                  : pieces
                    ? `Loose pieces after a plus: 4+6 is 4 ${product.unit} and 6 ${pieces}.`
                    : undefined
              }
            >
              <Input id="adjust-count" value={counted} inputMode="decimal" onChange={(e) => setCounted(e.target.value)} className={cn('font-mono', counted.trim() && countValue == null && invalidClass)} />
            </FormField>
          ) : (
            <FormField
              label="Quantity"
              required
              htmlFor="adjust-qty"
              span={4}
              error={tooMuch ? `That’s more than you have (${formatStock(stock, product)}). Use “Count correction” to set the real count instead.` : undefined}
              help={
                qtyValid
                  ? `${reason === 'damage' ? 'Removes' : 'Adds back'} ${amountText}.`
                  : reason === 'return'
                    ? 'Raising a credit note for this return? It adds the stock back by itself — don’t add it here too.'
                    : undefined
              }
            >
              <QtyUnitInput id="adjust-qty" product={product} qty={qty} unit={unit} onQtyChange={setQty} onUnitChange={setUnit} invalid={tooMuch} />
            </FormField>
          )}
        </FormGrid>
      </FormSection>

      <FormSection id="note" n={3} title="Note" aside="Shows in the stock history" done={!!note.trim()}>
        <FormGrid>
          <FormField label="Note" optional={reason !== 'damage'} htmlFor="adjust-note" span={6}>
            <Input
              id="adjust-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={reason === 'damage' ? 'e.g. Freezer door left open overnight' : reason === 'count' ? 'e.g. Month-end count' : 'e.g. Returned by the shop, unopened'}
            />
          </FormField>
        </FormGrid>
      </FormSection>
    </FormSheet>
  );
}
