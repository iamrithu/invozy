'use client';

import { useState } from 'react';
import { Package, Ruler, FileText, Eye, EyeOff, Trash2, Check, Sparkles, Hash, Plus, Tag, ImagePlus } from 'lucide-react';
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
};

type TierRow = { unit: string; price: string; approxQty: string };

/** Box/Bag are sold by a pack that's really counted in pieces, so this reads
 * as "≈ Pieces per Box"; other bulk units (Kg, Block, Slab...) get a plain
 * "≈ Quantity per X"; a loose Piece never needs this at all. Always optional
 * and purely informational — see ProductPriceTier.approxQty in
 * schema.prisma — never a purchase minimum. */
function approxQtyLabel(unit: string): string | null {
  const u = unit.trim().toLowerCase();
  if (!u || u === 'piece') return null;
  if (u === 'box' || u === 'bag') return `≈ Pieces per ${formatUnit(unit)} (optional)`;
  return `≈ Quantity per ${formatUnit(unit)} (optional)`;
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

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(product?.id ?? '');
  const deleteProduct = useDeleteProduct();
  const toggleActive = useToggleProductActive();
  const pending = createProduct.isPending || updateProduct.isPending;

  function resetForCreate() {
    setCategory('');
    setTiers([{ unit: 'box', price: '', approxQty: '' }]);
    setImages({ existing: [], files: [] });
  }

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
                <Switch checked={product.active} disabled={toggleActive.isPending} onChange={() => toggleActive.mutate(product.id)} />
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
                    const approxLabel = approxQtyLabel(t.unit);
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
                                className="w-full rounded-sm2 border border-line bg-surface px-2.5 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
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
          title="Remove product"
          description={
            <>
              Remove <b className="font-bold text-ink">{product.name}</b> from the catalog? This can&apos;t be undone.
            </>
          }
          confirmLabel="Delete product"
          pending={deleteProduct.isPending}
          onConfirm={handleDelete}
        />
      )}
    </Sheet>
  );
}
