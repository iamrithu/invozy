'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AffixInput, FormField, FormGrid, FormSection, FormSheet, Tag, submitIntent } from '@/components/ui/form-sheet';
import { fmtInr, formatUnit } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { formatStock, round6, unitFactor } from '@/lib/stock-units';
import { useAddStockMovement, useStockProducts } from '@/hooks/use-inventory';
import type { StockProduct } from '@/actions/inventory';
import { ProductPicker } from './product-picker';
import { QtyUnitInput } from './qty-unit-input';
import { packLabel } from './stock-meta';

/** "Stock in" drawer — goods received without a full purchase bill (or
 * when only the count matters). Opened from a row (product fixed) or from
 * the page header (pick a product first — and "Save & add another" moves
 * on to the next one). Posts a PURCHASE movement; a supplier bill with GST
 * belongs in Purchases instead, which the first section says. */
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
  const [formKey, setFormKey] = useState(0);
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
  const cost = Number(unitCost);
  const costTotal = valid && unitCost.trim() && cost > 0 ? n * cost : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const intent = submitIntent(e);
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
      if (intent === 'another') {
        // Same delivery, next item: keep the date and bill no.
        setPicked(null);
        setQty('');
        setUnitCost('');
        setBatchNo('');
        setExpiryDate('');
        setNote('');
        setFormKey((k) => k + 1);
        return;
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const sections = [
    { id: 'item', label: 'Item', done: !!product },
    { id: 'qty', label: 'Quantity & cost', done: valid },
    { id: 'batch', label: 'Batch', done: !!batchNo.trim() || !!expiryDate },
    { id: 'note', label: 'Note', done: !!note.trim() },
  ];

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      icon={<ArrowDownToLine size={18} />}
      title="Stock in"
      subtitle={product ? `Inventory · ${product.name}` : 'Inventory · goods received into the freezer'}
      formKey={formKey}
      onSubmit={submit}
      sections={sections}
      progress={product ? `${formatStock(product.stockQty, product)} in stock` : 'Pick a product'}
      preview={{
        caption: 'what this changes',
        content: product ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1 basis-40">
              <div className="truncate text-[14px] font-bold text-ink">{product.name}</div>
              <div className="mt-0.5 text-[12px] text-ink-soft">{[product.category, packLabel(product)].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[13px]">
              <span className="text-ink-soft">{formatStock(product.stockQty, product)}</span>
              <ArrowRight size={14} className="text-ink-faint" />
              <span className="font-bold text-ink">{formatStock(product.stockQty + mainQty, product)}</span>
            </div>
            <div className="flex basis-full flex-wrap gap-1.5">
              {valid ? <Tag tone="green">+ {formatStock(mainQty, product)}{!isMainUnit ? ` (${n} ${formatUnit(unit)})` : ''}</Tag> : <Tag>Enter a quantity</Tag>}
              {costTotal != null && <Tag>Cost {fmtInr(costTotal)}</Tag>}
              {reference.trim() && <Tag>Bill {reference.trim()}</Tag>}
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-faint">Pick a product to see its stock before and after.</p>
        ),
      }}
      submitLabel={valid && product ? `Add ${formatStock(mainQty, product)}` : 'Add to stock'}
      pending={add.isPending}
      submitDisabled={!valid}
      addAnother={!fixedProduct}
    >
      <FormSection id="item" n={1} title="Item" aside="Have the GST bill? Use Purchases" done={!!product}>
        <FormGrid>
          <FormField label="Product" required span={6} help={!product ? 'Products that aren’t tracked yet need a first count on the Inventory list.' : undefined}>
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
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Change product" onClick={() => setPicked(null)}>
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
          </FormField>
          <FormField label="Date" htmlFor="stock-in-date" span={3} half>
            <Input id="stock-in-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Supplier bill no." optional htmlFor="stock-in-ref" span={3} half>
            <Input id="stock-in-ref" value={reference} onChange={(e) => setReference(e.target.value)} className="font-mono" autoComplete="off" />
          </FormField>
        </FormGrid>
        <p className="mt-3 text-[12px] text-ink-faint sm:text-[11.5px]">
          Have the supplier’s GST bill?{' '}
          <Link href="/purchases/new" className="font-bold text-brand hover:underline" onClick={() => onOpenChange(false)}>
            Record it as a purchase
          </Link>{' '}
          — it adds the stock and keeps the input GST.
        </p>
      </FormSection>

      <FormSection id="qty" n={2} title="Quantity & cost" aside={product ? `Any unit — converted to ${formatUnit(product.unit)}` : undefined} done={valid}>
        {product ? (
          <FormGrid>
            <FormField
              label="Quantity received"
              required
              htmlFor="stock-in-qty"
              span={4}
              help={valid ? `Adds ${formatStock(mainQty, product)}${!isMainUnit ? ` (${n} ${formatUnit(unit)})` : ''}. New stock: ${formatStock(product.stockQty + mainQty, product)}.` : undefined}
            >
              <QtyUnitInput id="stock-in-qty" product={product} qty={qty} unit={unit} onQtyChange={setQty} onUnitChange={setUnit} />
            </FormField>
            <FormField label={`Cost per ${formatUnit(unit || product.unit)}`} optional htmlFor="stock-in-cost" span={2} help={costTotal != null ? `${fmtInr(costTotal)} in all` : undefined}>
              <AffixInput id="stock-in-cost" type="number" min="0" step="0.01" inputMode="decimal" before="₹" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" className="font-mono" />
            </FormField>
          </FormGrid>
        ) : (
          <p className="text-[12.5px] text-ink-faint">Pick the product first.</p>
        )}
      </FormSection>

      <FormSection id="batch" n={3} title="Batch" aside="Optional · for expiry alerts" done={sections[2].done}>
        <FormGrid>
          <FormField label="Batch no." optional htmlFor="stock-in-batch" span={3} half>
            <Input id="stock-in-batch" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} className="font-mono" autoComplete="off" />
          </FormField>
          <FormField label="Expiry date" optional htmlFor="stock-in-expiry" span={3} half>
            <Input id="stock-in-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection id="note" n={4} title="Note" aside="Shows in the stock history" done={!!note.trim()}>
        <FormGrid>
          <FormField label="Note" optional htmlFor="stock-in-note" span={6}>
            <Input id="stock-in-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Morning delivery" />
          </FormField>
        </FormGrid>
      </FormSection>
    </FormSheet>
  );
}
