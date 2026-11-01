'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetIcon, SheetTitle } from '@/components/ui/sheet';
import { formatUnit } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { formatStock, round6, unitFactor } from '@/lib/stock-units';
import { useAddStockMovement, useStockProducts } from '@/hooks/use-inventory';
import type { StockProduct } from '@/actions/inventory';
import { ProductPicker } from './product-picker';
import { ConvertNote, QtyUnitInput } from './qty-unit-input';
import { packLabel } from './stock-meta';

/** "Stock in" drawer — goods received without a full purchase bill (or
 * when only the count matters). Opened from a row (product fixed) or from
 * the page header (pick a product first). Posts a PURCHASE movement; a
 * supplier bill with GST belongs in Purchases instead, which says so at the
 * bottom. */
export function StockInSheet({
  open,
  onOpenChange,
  product: fixedProduct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: StockProduct | null;
}) {
  const { data: products = [], isLoading } = useStockProducts(open && !fixedProduct);
  const add = useAddStockMovement();
  const [picked, setPicked] = useState<StockProduct | null>(null);
  // The row's product (kept live, so its balance follows refetches) or the
  // one chosen in the picker.
  const product = fixedProduct ?? picked;
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState(fixedProduct?.unit ?? '');
  const [date, setDate] = useState(todayIst());
  const [reference, setReference] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [note, setNote] = useState('');

  // A fresh form every time the drawer opens (keyed on the product's id, not
  // the object — a background refetch must not wipe what's being typed).
  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setUnit(fixedProduct?.unit ?? '');
    setQty('');
    setDate(todayIst());
    setReference('');
    setUnitCost('');
    setBatchNo('');
    setExpiryDate('');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedProduct?.id]);

  const n = Number(qty);
  const valid = !!product && qty.trim() !== '' && Number.isFinite(n) && n > 0;
  const mainQty = product && valid ? round6(n * unitFactor(product, unit)) : 0;
  const isMainUnit = !product || unit.trim().toLowerCase() === product.unit.trim().toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || !valid) return;
    try {
      await add.mutateAsync({
        productId: product.id,
        input: {
          type: 'PURCHASE',
          qty: n,
          unit,
          date,
          reference,
          unitCost: unitCost.trim() ? Number(unitCost) : null,
          batchNo,
          expiryDate: expiryDate || null,
          note,
        },
      });
      toast.success(`Added ${formatStock(mainQty, product)} to ${product.name}`);
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
              <ArrowDownToLine size={16} />
            </SheetIcon>
            <div className="min-w-0 flex-1">
              <SheetTitle>Stock in</SheetTitle>
              <p className="truncate text-[11.5px] text-ink-faint">{product ? product.name : 'Goods received into the freezer'}</p>
            </div>
          </SheetHeader>

          <SheetBody className="space-y-3.5">
            <div>
              <Label>Product</Label>
              {product ? (
                <div className="flex items-center gap-2 rounded-sm2 border border-line bg-surface-alt px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-ink">{product.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      In stock {formatStock(product.stockQty, product)}
                      {packLabel(product) ? ` · ${packLabel(product)}` : ''}
                    </div>
                  </div>
                  {!fixedProduct && (
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Change product" onClick={() => setPicked(null)}>
                      <X size={14} />
                    </Button>
                  )}
                </div>
              ) : (
                <ProductPicker
                  products={products}
                  loading={isLoading}
                  autoFocus
                  disabledReason={(p) => (p.trackStock ? null : 'Not tracked')}
                  onPick={(p) => {
                    setPicked(p);
                    setUnit(p.unit);
                  }}
                />
              )}
              {!product && <p className="mt-1 text-[11px] text-ink-faint">Products that aren’t tracked yet need a first count on the Inventory list.</p>}
            </div>

            {product && (
              <>
                <div>
                  <Label htmlFor="stock-in-qty">Quantity received</Label>
                  <QtyUnitInput id="stock-in-qty" product={product} qty={qty} unit={unit} onQtyChange={setQty} onUnitChange={setUnit} />
                  {valid && (
                    <ConvertNote>
                      Adds {formatStock(mainQty, product)}
                      {!isMainUnit ? ` (${n} ${formatUnit(unit)})` : ''}. New stock: {formatStock(product.stockQty + mainQty, product)}.
                    </ConvertNote>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date" name="stock-in-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  <Field label="Supplier bill no." name="stock-in-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
                  <Field
                    label={`Cost per ${formatUnit(unit || product.unit)} (optional)`}
                    name="stock-in-cost"
                    type="number"
                    mono
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder="0.00"
                  />
                  <Field label="Batch no. (optional)" name="stock-in-batch" mono value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
                  <Field label="Expiry date (optional)" name="stock-in-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                  <Field label="Note (optional)" name="stock-in-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Morning delivery" />
                </div>
              </>
            )}

            <p className="text-[11.5px] text-ink-faint">
              Have the supplier’s GST bill?{' '}
              <Link href="/purchases/new" className="font-bold text-brand hover:underline" onClick={() => onOpenChange(false)}>
                Record it as a purchase
              </Link>{' '}
              — it adds the stock and keeps the input GST.
            </p>
          </SheetBody>

          <SheetFooter className="justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || add.isPending}>
              <Check size={13} /> {add.isPending ? 'Saving…' : valid && product ? `Add ${formatStock(mainQty, product)}` : 'Add stock'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
