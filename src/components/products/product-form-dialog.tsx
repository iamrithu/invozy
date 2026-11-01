'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Package, Ruler, FileText, Eye, EyeOff, Trash2, Check, Sparkles, Hash, Plus, Tag, ImagePlus, Boxes, History } from 'lucide-react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Sheet, SheetContent, SheetHeader, SheetIcon, SheetBody, SheetFooter } from '@/components/ui/sheet';
import { fmtInr, formatUnit } from '@/lib/gst';
import { useCreateProduct, useUpdateProduct, useDeleteProduct, useToggleProductActive } from '@/hooks/use-products';
import { CategoryCombobox } from '@/components/products/category-combobox';
import { ProductImagesField, type PendingImages } from '@/components/products/product-images-field';
import { UNITS } from '@/lib/units';
import { formatStock, isPieceUnit, mainPieces, needsPackSize, piecesText, unitFactor, type UnitProduct } from '@/lib/stock-units';
import { MixedQtyInput, mixedTotal, type MixedQty } from '@/components/inventory/mixed-qty-input';
import { StockBadge } from '@/components/products/stock-badge';

type PriceTier = { id?: string; unit: string; price: string | number; approxQty: string | number | null };

type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  price: string | number;
  packQty: number | null;
  active: boolean;
  desc: string | null;
  images: string[];
  hsn?: string | null;
  priceTiers?: PriceTier[];
  trackStock?: boolean;
  stockQty?: string | number;
  lowStockAt?: string | number | null;
};

type TierRow = { unit: string; price: string; approxQty: string };

/** Box/Bag are sold by a pack that's really counted in pieces, so this reads
 * as "≈ Pieces per Box"; other bulk units (Kg, Block, Slab...) get a plain
 * "≈ Quantity per X"; a loose Piece never needs this at all. Always optional
 * and purely informational — see ProductPriceTier.approxQty in
 * schema.prisma — never a purchase minimum. */
function approxQtyLabel(unit: string, required = false): string | null {
  const u = unit.trim().toLowerCase();
  if (!u || u === 'piece') return null;
  const hint = required ? '(needed for stock)' : '(optional)';
  if (u === 'box' || u === 'bag') return `Pieces in 1 ${formatUnit(unit)} ${hint}`;
  return `≈ Quantity per ${formatUnit(unit)} ${hint}`;
}

/** The form's tiers in the shape src/lib/stock-units.ts converts with —
 * the first tier is the main (stock-counting) unit. */
function unitShape(tiers: TierRow[]): UnitProduct {
  const rows = tiers.filter((t) => t.unit.trim());
  return {
    unit: rows[0]?.unit ?? '',
    packQty: rows[0]?.approxQty ? parseFloat(rows[0].approxQty) : null,
    priceTiers: rows.map((t) => ({ unit: t.unit, approxQty: t.approxQty.trim() ? parseFloat(t.approxQty) : null })),
  };
}

/** One line under the stock fields explaining how the units convert, e.g.
 * "Counted in Box (25 pcs each). 1 Bag = 40 pcs, taken out as 1 Box + 15 Pc."
 * — pieces being the common measure whenever the units say how many they
 * hold. */
function conversionHint(shape: UnitProduct, opening: number): string {
  const main = formatUnit(shape.unit);
  if (!main) return '';
  if (needsPackSize(shape)) return `Counted in ${main}. Set the pieces in 1 ${main} above so smaller sales can be taken out of stock.`;
  const others = (shape.priceTiers ?? []).filter((t) => t.unit.trim().toLowerCase() !== shape.unit.trim().toLowerCase());
  const n = mainPieces(shape);
  if (n > 1) {
    const parts = others
      .filter((t) => t.unit.trim() && !isPieceUnit(t.unit))
      .map((t) => `1 ${formatUnit(t.unit)} = ${Math.round(unitFactor(shape, t.unit) * n * 100) / 100} pcs, taken out as ${formatStock(unitFactor(shape, t.unit), shape)}`);
    const total = opening > 0 ? ` Opening: ${formatStock(opening, shape)} = ${piecesText(opening, shape)}.` : '';
    return `Counted in ${main} (${n} pcs each).${parts.length ? ` ${parts.join('. ')}.` : ''} Stock can be entered in any unit, or as loose pieces.${total}`;
  }
  const smaller = others.find((t) => unitFactor(shape, t.unit) < 1);
  if (smaller) {
    const f = unitFactor(shape, smaller.unit);
    const n = Math.round(1 / f);
    const example = opening > f ? opening - f : 4 + 6 * f;
    return `Counted in ${main}. Selling 1 ${formatUnit(smaller.unit)} takes away 1/${n} ${main}, shown as "${formatStock(example, shape)}".`;
  }
  const bigger = others.find((t) => unitFactor(shape, t.unit) > 1);
  if (bigger) return `Counted in ${main}. Selling 1 ${formatUnit(bigger.unit)} takes away ${unitFactor(shape, bigger.unit)} ${main}.`;
  return `Counted in ${main}.`;
}

/** Seeds the tier list from `product.priceTiers` when editing (every
 * product has at least one tier once the backfill migration has run), or
 * from the legacy single unit/price/packQty fields as a fallback, or a
 * blank starter row for a brand-new product. */
function buildInitialTiers(product?: Product, prefill?: { name?: string; unit?: string; price?: string }): TierRow[] {
  if (product?.priceTiers && product.priceTiers.length > 0) {
    return product.priceTiers.map((t) => ({
      unit: t.unit,
      price: String(t.price),
      approxQty: t.approxQty != null ? String(t.approxQty) : '',
    }));
  }
  if (product) {
    return [{ unit: product.unit, price: String(product.price), approxQty: product.packQty ? String(product.packQty) : '' }];
  }
  return [{ unit: prefill?.unit ?? 'box', price: prefill?.price ?? '', approxQty: '' }];
}

/** Consistent section header used throughout the form — icon + title, plus
 * an optional one-line description for sections that benefit from a bit of
 * guidance (pricing tiers, photos). */
function SectionHeading({ icon: Icon, title, description }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; description?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-ink">
        <Icon size={13} className="text-brand" /> {title}
      </div>
      {description && <p className="mt-0.5 text-[11px] text-ink-faint">{description}</p>}
    </div>
  );
}

export function ProductFormDialog({
  open,
  onOpenChange,
  mode,
  product,
  prefill,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  product?: Product;
  /** Pre-fills a brand-new product's fields (e.g. promoting a repeated
   * custom invoice line item into the catalog) — real defaultValues, not
   * just a placeholder hint. */
  prefill?: { name?: string; unit?: string; price?: string };
  onDeleted?: () => void;
}) {
  const [category, setCategory] = useState(product?.category ?? '');
  const [tiers, setTiers] = useState<TierRow[]>(() => buildInitialTiers(product, prefill));
  const [images, setImages] = useState<PendingImages>({ existing: product?.images ?? [], files: [] });
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Stock section — create mode only switches tracking on; once a product
  // exists, tracking and counts are managed from Inventory (every change
  // recorded there), and only the low-stock alert is editable here.
  const [trackStock, setTrackStock] = useState(false);
  const [openingStock, setOpeningStock] = useState<MixedQty>({});
  const [lowStockAt, setLowStockAt] = useState(product?.lowStockAt != null ? String(Number(product.lowStockAt)) : '');

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(product?.id ?? '');
  const deleteProduct = useDeleteProduct();
  const toggleActive = useToggleProductActive();
  const pending = createProduct.isPending || updateProduct.isPending;

  function resetForCreate() {
    setCategory('');
    setTiers([{ unit: 'box', price: '', approxQty: '' }]);
    setImages({ existing: [], files: [] });
    setTrackStock(false);
    setOpeningStock({});
    setLowStockAt('');
  }

  const tracked = mode === 'create' ? trackStock : !!product?.trackStock;
  const shape = unitShape(tiers);
  const packSizeMissing = tracked && needsPackSize(shape);
  const mainUnit = formatUnit(shape.unit) || 'unit';

  function updateTier(i: number, patch: Partial<TierRow>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addTier() {
    setTiers((prev) => [...prev, { unit: 'box', price: '', approxQty: '' }]);
  }
  function removeTier(i: number) {
    setTiers((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const validTiers = tiers
      .map((t) => ({ unit: t.unit.trim(), price: parseFloat(t.price) || 0, approxQty: t.approxQty.trim() ? parseFloat(t.approxQty) : null }))
      .filter((t) => t.unit && t.price > 0);
    if (validTiers.length === 0) {
      setError('Add at least one pricing option — a unit and a price above 0.');
      setFieldErrors({ tiers: 'Add at least one pricing option — a unit and a price above 0.' });
      return;
    }
    if (tracked && needsPackSize({ unit: validTiers[0].unit, packQty: validTiers[0].approxQty, priceTiers: validTiers })) {
      const msg = `Set how many pieces are in 1 ${formatUnit(validTiers[0].unit)} — stock is counted in ${formatUnit(validTiers[0].unit)}, so smaller sales can't be converted without it.`;
      setError(msg);
      setFieldErrors({ tiers: msg });
      return;
    }
    if (mode === 'create') {
      formData.set('trackStock', String(trackStock));
      if (trackStock) {
        const opening = mixedTotal(shape, openingStock);
        formData.set('openingStock', opening > 0 ? String(opening) : '');
        formData.set('lowStockAt', lowStockAt.trim());
      }
    } else if (product?.trackStock) {
      formData.set('lowStockAt', lowStockAt.trim());
    }
    // Product.unit/price/packQty stay the "primary" fields (dashboard/
    // reports/quick list keep reading them directly, and packQty is also
    // what the MODERN template's box/pieces display hint reads) — always
    // mirrored from the first pricing option; the full list goes to the
    // server as `tiers`.
    formData.set('unit', validTiers[0].unit);
    formData.set('price', String(validTiers[0].price));
    formData.set('packQty', validTiers[0].approxQty != null ? String(validTiers[0].approxQty) : '');
    formData.set('tiers', JSON.stringify(validTiers));
    images.existing.forEach((url) => formData.append('images', url));
    images.files.forEach((file) => formData.append('newImages', file));
    setError(undefined);
    setFieldErrors({});
    const result = mode === 'create' ? await createProduct.mutateAsync(formData) : await updateProduct.mutateAsync(formData);
    if (result.error) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success(mode === 'create' ? 'Product added to catalog' : 'Product updated');
    onOpenChange(false);
    if (mode === 'create') resetForCreate();
  }

  async function handleDelete() {
    if (!product) return;
    try {
      await deleteProduct.mutateAsync(product.id);
      setDeleteOpen(false);
      toast.success('Product removed');
      onOpenChange(false);
      onDeleted?.();
    } catch (e: any) {
      setDeleteOpen(false);
      toast.error(e.message);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form onSubmit={handleSubmit} className="contents">
          <SheetHeader>
            <SheetIcon>{mode === 'create' ? <Sparkles size={16} /> : <Package size={16} />}</SheetIcon>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-extrabold text-ink">{mode === 'create' ? 'New product' : product?.name}</div>
              <div className="text-[11.5px] text-ink-faint">{mode === 'create' ? 'Add an item to your catalog' : 'Edit product details'}</div>
            </div>
            {mode === 'edit' && product && (
              <label className="flex flex-shrink-0 cursor-pointer items-center gap-2">
                {product.active ? <Eye size={13} className="text-green" /> : <EyeOff size={13} className="text-ink-faint" />}
                <span className={`text-[11px] font-bold ${product.active ? 'text-green' : 'text-ink-faint'}`}>{product.active ? 'Live' : 'Hidden'}</span>
                <Switch
                  checked={product.active}
                  disabled={toggleActive.isPending}
                  onChange={() => toggleActive.mutate({ id: product.id, active: !product.active }, { onError: (e) => toast.error(e.message) })}
                />
              </label>
            )}
          </SheetHeader>

          <SheetBody>
            <div className="space-y-6">
              <section>
                <SectionHeading icon={Package} title="Basic details" />
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Product name" name="name" icon={Package} defaultValue={product?.name ?? prefill?.name} error={fieldErrors.name} />
                  <div>
                    <CategoryCombobox name="category" value={category} onChange={setCategory} />
                    {fieldErrors.category && <p className="mt-1 text-[11px] font-semibold text-destructive">{fieldErrors.category}</p>}
                  </div>
                </div>
              </section>

              <section className="border-t border-line pt-5">
                <SectionHeading
                  icon={Ruler}
                  title="Pricing options"
                  description="Every way this product is sold, by unit — the first option becomes its main listed price."
                />
                <div className="mt-3 space-y-2.5">
                  {tiers.map((t, i) => {
                    // The main (first) unit's pack size is what stock
                    // conversion hangs on — flag it when tracking needs it.
                    const approxLabel = approxQtyLabel(t.unit, i === 0 && packSizeMissing);
                    const approxQtyNum = parseFloat(t.approxQty);
                    const priceNum = parseFloat(t.price);
                    // Divides this tier's own price by its approx quantity to
                    // show what it works out to per piece — e.g. a Box priced
                    // at ₹450 with ≈40 pieces reads as "≈₹11.25 / Piece",
                    // so a bulk price can be compared at a glance against the
                    // plain Piece tier's price. Purely a derived display —
                    // never sent to the server or stored anywhere.
                    const perPiece = approxLabel && approxQtyNum > 0 && priceNum > 0 ? priceNum / approxQtyNum : null;
                    return (
                      <div key={i} className="rounded-md2 border border-line bg-bg p-3">
                        <div className="mb-2.5 flex items-center justify-between">
                          <span className="flex h-5 w-5 items-center justify-center rounded-sm2 bg-surface-alt text-[10px] font-extrabold text-ink-soft">{i + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeTier(i)}
                            disabled={tiers.length === 1}
                            aria-label="Remove pricing option"
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 text-ink-faint transition-colors hover:bg-brand-light hover:text-brand-dark disabled:pointer-events-none disabled:opacity-30"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Unit</label>
                            <select
                              value={t.unit}
                              onChange={(e) => updateTier(i, { unit: e.target.value })}
                              className="w-full rounded-sm2 border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                            >
                              {(UNITS.includes(t.unit) ? UNITS : [t.unit, ...UNITS]).map((u) => (
                                <option key={u} value={u}>
                                  {formatUnit(u)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Price (₹)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={t.price}
                              onChange={(e) => updateTier(i, { price: e.target.value })}
                              className="w-full rounded-sm2 border border-line bg-surface px-2.5 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          {approxLabel && (
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">{approxLabel}</label>
                              <input
                                type="number"
                                value={t.approxQty}
                                onChange={(e) => updateTier(i, { approxQty: e.target.value })}
                                className={`w-full rounded-sm2 border bg-surface px-2.5 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 ${
                                  i === 0 && packSizeMissing ? 'border-gold' : 'border-line'
                                }`}
                              />
                            </div>
                          )}
                        </div>
                        {perPiece != null && (
                          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-sm2 bg-brand-light px-2 py-1 text-[10.5px] font-bold text-brand-dark">
                            <Tag size={11} /> ≈ {fmtInr(perPiece)} per Piece
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addTier}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md2 border border-dashed border-line py-2.5 text-[12px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-brand"
                >
                  <Plus size={13} /> Add another pricing option
                </button>
                {fieldErrors.tiers && <p className="mt-1.5 text-[11px] font-semibold text-destructive">{fieldErrors.tiers}</p>}
              </section>

              <StockSection
                mode={mode}
                product={product}
                trackStock={trackStock}
                onTrackStockChange={setTrackStock}
                openingStock={openingStock}
                onOpeningStockChange={setOpeningStock}
                lowStockAt={lowStockAt}
                onLowStockAtChange={setLowStockAt}
                mainUnit={mainUnit}
                shape={shape}
                hint={conversionHint(shape, mixedTotal(shape, openingStock))}
                fieldErrors={fieldErrors}
              />

              <section className="border-t border-line pt-5">
                <SectionHeading icon={FileText} title="Additional details" />
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="HSN/SAC code (optional)" name="hsn" icon={Hash} mono defaultValue={product?.hsn ?? ''} />
                  <Field label="Short description (optional)" name="desc" icon={FileText} defaultValue={product?.desc ?? ''} />
                </div>
              </section>

              <section className="border-t border-line pt-5">
                <SectionHeading icon={ImagePlus} title="Photos" description="Shown in the catalog and while building an invoice." />
                <div className="mt-3">
                  <ProductImagesField value={images} onChange={setImages} />
                </div>
              </section>
            </div>
            {error && <p className="mt-4 text-[12.5px] font-bold text-destructive">{error}</p>}
          </SheetBody>

          <SheetFooter>
            {mode === 'edit' && (
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)} className="mr-auto border-red-soft text-red hover:bg-red-soft">
                <Trash2 size={13} /> Delete
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <Check size={13} /> {pending ? 'Saving…' : mode === 'create' ? 'Add product' : 'Save changes'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>

      {mode === 'edit' && product && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${product.name}?`}
          description="Old invoices keep this product's name, rate and HSN. Its stock history is removed. To keep it but stop selling it, hide it instead."
          icon={Trash2}
          confirmIcon={Trash2}
          confirmLabel="Delete product"
          pending={deleteProduct.isPending}
          onConfirm={handleDelete}
        />
      )}
    </Sheet>
  );
}

const stockInputClass =
  'w-full rounded-sm2 border border-line bg-surface px-2.5 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20';

/** Create mode: optional opening stock — "Track stock" off leaves the
 * product untracked (billing works as before); on with an empty opening
 * count starts it at 0. Edit mode: current stock read-only with a link to
 * its history, plus the low-stock alert. */
function StockSection({
  mode,
  product,
  trackStock,
  onTrackStockChange,
  openingStock,
  onOpeningStockChange,
  lowStockAt,
  onLowStockAtChange,
  mainUnit,
  shape,
  hint,
  fieldErrors,
}: {
  mode: 'create' | 'edit';
  product?: Product;
  trackStock: boolean;
  onTrackStockChange: (v: boolean) => void;
  openingStock: MixedQty;
  onOpeningStockChange: (v: MixedQty) => void;
  lowStockAt: string;
  onLowStockAtChange: (v: string) => void;
  mainUnit: string;
  shape: UnitProduct;
  hint: string;
  fieldErrors: Record<string, string>;
}) {
  const lowStockField = (
    <div>
      <label htmlFor="lowStockAt" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        Low-stock alert at
      </label>
      <div className="flex items-center gap-2">
        <input id="lowStockAt" type="number" min="0" step="any" inputMode="decimal" value={lowStockAt} onChange={(e) => onLowStockAtChange(e.target.value)} placeholder="Optional" className={stockInputClass} />
        <span className="flex-shrink-0 text-[12px] font-bold text-ink-soft">{mainUnit}</span>
      </div>
      {fieldErrors.lowStockAt ? (
        <p className="mt-1 text-[11px] font-semibold text-destructive">{fieldErrors.lowStockAt}</p>
      ) : (
        <p className="mt-1 text-[11px] text-ink-faint">Shows amber on Inventory at or below this.</p>
      )}
    </div>
  );

  if (mode === 'edit' && product) {
    const tracked = !!product.trackStock;
    return (
      <section className="border-t border-line pt-5">
        <SectionHeading icon={Boxes} title="Stock" description={tracked ? 'Counts change through Inventory, so every change is recorded.' : undefined} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md2 border border-line bg-bg px-3 py-2.5">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="text-ink-faint">{tracked ? 'In stock' : 'Stock'}</span>
            <StockBadge product={{ ...product, trackStock: tracked, stockQty: product.stockQty ?? 0 }} />
          </div>
          <Link href={`/inventory/${product.id}`} className="flex items-center gap-1 text-[12px] font-bold text-brand hover:underline">
            <History size={12} /> {tracked ? 'View stock history' : 'Start tracking in Inventory'}
          </Link>
        </div>
        {tracked && <div className="mt-3 sm:max-w-[50%]">{lowStockField}</div>}
      </section>
    );
  }

  return (
    <section className="-mx-[22px] border-t border-line bg-brand-light px-[22px] py-5">
      <SectionHeading icon={Boxes} title="Stock (optional)" />
      <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-md2 border border-line bg-surface px-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-ink">Track stock for this product</span>
          <span className="block text-[11.5px] text-ink-soft">Every saved invoice, drafts included, takes it out of stock.</span>
        </span>
        <Switch checked={trackStock} onChange={(e) => onTrackStockChange(e.target.checked)} aria-label="Track stock" />
      </label>
      {trackStock ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Opening stock — what you have now, in any units</span>
              <MixedQtyInput product={shape} values={openingStock} onChange={onOpeningStockChange} idPrefix="openingStock" invalid={!!fieldErrors.openingStock} />
              {fieldErrors.openingStock ? (
                <p className="mt-1 text-[11px] font-semibold text-destructive">{fieldErrors.openingStock}</p>
              ) : (
                <p className="mt-1 text-[11px] text-ink-faint">Leave empty to start at 0 and add stock later.</p>
              )}
            </div>
            {lowStockField}
          </div>
          {hint && <p className="mt-3 rounded-sm2 bg-surface px-2.5 py-2 text-[11.5px] font-semibold text-ink-soft">{hint}</p>}
        </>
      ) : (
        <p className="mt-2 text-[11.5px] text-ink-faint">Not tracked. Invoices won&apos;t check stock for this product. You can start tracking later from Inventory.</p>
      )}
    </section>
  );
}
