'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Package, Eye, EyeOff, Trash2, Sparkles, Plus, ImageIcon, History } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AffixInput, FormField, FormGrid, FormSection, FormSheet, Tag, invalidClass, selectClass, submitIntent, type FormValues } from '@/components/ui/form-sheet';
import { fmtInr, formatUnit } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { useCreateProduct, useUpdateProduct, useDeleteProduct, useToggleProductActive, useProductCategories } from '@/hooks/use-products';
import { CategoryCombobox } from '@/components/products/category-combobox';
import { ProductImagesField, type PendingImages } from '@/components/products/product-images-field';
import { UNITS } from '@/lib/units';
import { formatStock, isPieceUnit, mainPieces, needsPackSize, piecesText, unitFactor, type UnitProduct } from '@/lib/stock-units';
import { MixedQtyInput, mixedTotal, type MixedQty } from '@/components/inventory/mixed-qty-input';
import { StockBadge } from '@/components/products/stock-badge';
import { useModules } from '@/components/modules/modules-provider';

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
  discount?: string | number;
};

type TierRow = { unit: string; price: string; approxQty: string };

/** Box/Bag are sold by a pack that's really counted in pieces, so this reads
 * as "Pieces in 1 Box"; other bulk units (Kg, Block, Slab...) get a plain
 * "≈ Quantity per X"; a loose Piece never needs this at all. Always optional
 * and purely informational — see ProductPriceTier.approxQty in
 * schema.prisma — never a purchase minimum. */
function approxQtyLabel(unit: string): string | null {
  const u = unit.trim().toLowerCase();
  if (!u || u === 'piece') return null;
  if (u === 'box' || u === 'bag') return `Pieces in 1 ${formatUnit(unit)}`;
  return `≈ Quantity per ${formatUnit(unit)}`;
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

// Which section each server-side field error belongs to, and its label in
// the footer's "to fix" summary.
const FIELDS: Record<string, { section: string; label: string }> = {
  name: { section: 'basics', label: 'Product name' },
  category: { section: 'basics', label: 'Category' },
  hsn: { section: 'basics', label: 'HSN/SAC' },
  desc: { section: 'basics', label: 'Description' },
  tiers: { section: 'pricing', label: 'Pricing' },
  discount: { section: 'pricing', label: 'Discount' },
  openingStock: { section: 'stock', label: 'Opening stock' },
  lowStockAt: { section: 'stock', label: 'Low-stock alert' },
};

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
  const [formKey, setFormKey] = useState(0);
  const [values, setValues] = useState<FormValues>({});
  const [category, setCategory] = useState(product?.category ?? '');
  const [tiers, setTiers] = useState<TierRow[]>(() => buildInitialTiers(product, prefill));
  const [images, setImages] = useState<PendingImages>({ existing: product?.images ?? [], files: [] });
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | string[]>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Stock section — create mode only switches tracking on; once a product
  // exists, tracking and counts are managed from Inventory (every change
  // recorded there), and only the low-stock alert is editable here.
  const [trackStock, setTrackStock] = useState(false);
  const [openingStock, setOpeningStock] = useState<MixedQty>({});
  const [lowStockAt, setLowStockAt] = useState(product?.lowStockAt != null ? String(Number(product.lowStockAt)) : '');
  const { data: categories = [] } = useProductCategories();

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(product?.id ?? '');
  const deleteProduct = useDeleteProduct();
  const toggleActive = useToggleProductActive();
  const pending = createProduct.isPending || updateProduct.isPending;

  const fe = (k: string) => {
    const v = fieldErrors[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const issuesIn = (section: string) => Object.keys(fieldErrors).filter((k) => FIELDS[k]?.section === section).length;

  function resetForCreate() {
    setCategory('');
    setTiers([{ unit: 'box', price: '', approxQty: '' }]);
    setImages({ existing: [], files: [] });
    setTrackStock(false);
    setOpeningStock({});
    setLowStockAt('');
    setFieldErrors({});
    setError(undefined);
    setFormKey((k) => k + 1);
  }

  // Inventory off (src/lib/modules.ts): no Stock section, and no pack-size
  // rule — it only exists to convert sales into stock.
  const inventoryOn = useModules().enabled('inventory');
  const tracked = inventoryOn && (mode === 'create' ? trackStock : !!product?.trackStock);
  const shape = unitShape(tiers);
  const packSizeMissing = tracked && needsPackSize(shape);
  const mainUnit = formatUnit(shape.unit) || 'unit';
  const pieces = mainPieces(shape);

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
    const intent = submitIntent(e);
    const formData = new FormData(e.currentTarget);
    const validTiers = tiers
      .map((t) => ({ unit: t.unit.trim(), price: parseFloat(t.price) || 0, approxQty: t.approxQty.trim() ? parseFloat(t.approxQty) : null }))
      .filter((t) => t.unit && t.price > 0);
    if (validTiers.length === 0) {
      setError(undefined);
      setFieldErrors({ tiers: 'Add at least one unit with a price above 0.' });
      return;
    }
    if (tracked && needsPackSize({ unit: validTiers[0].unit, packQty: validTiers[0].approxQty, priceTiers: validTiers })) {
      const msg = `Set how many pieces are in 1 ${formatUnit(validTiers[0].unit)} — stock is counted in ${formatUnit(validTiers[0].unit)}, so smaller sales can't be converted without it.`;
      setError(undefined);
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
    toast.success(mode === 'create' ? `Added ${String(formData.get('name') ?? '').trim()} to the catalog` : 'Product updated');
    if (mode === 'create') resetForCreate();
    if (intent !== 'another') onOpenChange(false);
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

  // First photo for the preview — a picked file shows before it's uploaded.
  const firstFile = images.existing.length ? null : images.files[0];
  const fileUrl = useMemo(() => (firstFile ? URL.createObjectURL(firstFile) : null), [firstFile]);
  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);
  const thumb = images.existing[0] ?? fileUrl;

  const name = values.name?.trim() ?? '';
  const discount = Number(values.discount) || 0;
  const hsn = values.hsn?.trim();
  const priced = tiers.filter((t) => t.unit.trim() && parseFloat(t.price) > 0);
  const openingTotal = mixedTotal(shape, openingStock);
  const stockText =
    mode === 'create'
      ? trackStock
        ? `${formatStock(openingTotal, shape)} in stock`
        : 'Stock not tracked'
      : product?.trackStock
        ? `${formatStock(Number(product.stockQty ?? 0), shape)} in stock`
        : 'Stock not tracked';
  const photoCount = images.existing.length + images.files.length;

  const sections = [
    { id: 'basics', label: 'Basics', done: !!name && !!category.trim() && !issuesIn('basics'), issues: issuesIn('basics') },
    { id: 'pricing', label: 'Pricing', done: priced.length > 0 && !packSizeMissing && !issuesIn('pricing'), issues: issuesIn('pricing') },
    ...(inventoryOn ? [{ id: 'stock', label: 'Stock', done: (mode === 'edit' || trackStock) && !issuesIn('stock'), issues: issuesIn('stock') }] : []),
    { id: 'photos', label: 'Photos', done: photoCount > 0 },
  ];

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        icon={mode === 'create' ? <Sparkles size={18} /> : <Package size={18} />}
        title={mode === 'create' ? 'New product' : 'Edit product'}
        subtitle={mode === 'create' ? 'Products · adds to your catalog' : `Products · ${product?.name}`}
        headerAside={
          mode === 'edit' &&
          product && (
            <label className="flex flex-shrink-0 cursor-pointer items-center gap-2" title="Hidden products don't show while billing">
              {product.active ? <Eye size={14} className="text-green" /> : <EyeOff size={14} className="text-ink-faint" />}
              <span className={cn('hidden text-[12px] font-semibold sm:inline', product.active ? 'text-green' : 'text-ink-faint')}>{product.active ? 'Live' : 'Hidden'}</span>
              <Switch
                checked={product.active}
                disabled={toggleActive.isPending}
                aria-label="Show while billing"
                onChange={() => toggleActive.mutate({ id: product.id, active: !product.active }, { onError: (e) => toast.error(e.message) })}
              />
            </label>
          )
        }
        formKey={formKey}
        onValues={setValues}
        onSubmit={handleSubmit}
        sections={sections}
        preview={{
          caption: 'how it shows while billing',
          content: (
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-sm2 bg-surface-alt text-ink-faint">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon size={20} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-[14px] font-bold', name ? 'text-ink' : 'text-ink-faint')}>{name || 'Product name'}</div>
                <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-soft">
                  {priced.length
                    ? priced
                        .map((t) => {
                          const each = parseFloat(t.approxQty);
                          const price = parseFloat(t.price);
                          const per = approxQtyLabel(t.unit) && each > 0 ? ` (≈${fmtInr(price / each)}/pc)` : '';
                          return `${fmtInr(price)}/${formatUnit(t.unit)}${per}`;
                        })
                        .join(' · ')
                    : 'No price yet'}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Tag tone={stockText.endsWith('in stock') ? 'green' : 'grey'}>{stockText}</Tag>
                  {discount > 0 && <Tag tone="red">{discount}% off</Tag>}
                  {(category.trim() || hsn) && <Tag>{[category.trim(), hsn && `HSN ${hsn}`].filter(Boolean).join(' · ')}</Tag>}
                </div>
              </div>
            </div>
          ),
        }}
        submitLabel={mode === 'create' ? 'Save product' : 'Save changes'}
        pending={pending}
        addAnother={mode === 'create' && !prefill}
        onDelete={mode === 'edit' ? () => setDeleteOpen(true) : undefined}
        issues={Object.keys(fieldErrors).map((k) => FIELDS[k]?.label ?? k)}
        error={error}
      >
        <FormSection id="basics" n={1} title="Basics" aside="Name and category are required" done={sections[0].done}>
          <FormGrid>
            <FormField label="Product name" required htmlFor="product-name" span={4} error={fe('name')}>
              <Input id="product-name" name="name" defaultValue={product?.name ?? prefill?.name} placeholder="e.g. CM - American Sundae 12*100ml" autoComplete="off" className={cn(fe('name') && invalidClass)} />
            </FormField>
            <FormField label="Category" required htmlFor="product-category" span={2} error={fe('category')}>
              <CategoryCombobox id="product-category" name="category" value={category} onChange={setCategory} hideLabel invalid={!!fe('category')} />
            </FormField>
            {categories.length > 0 && (
              <div className="col-span-2 -mt-1 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] sm:col-span-6">
                <span className="flex-shrink-0 pr-0.5 text-[11px] text-ink-faint">Yours</span>
                {categories.slice(0, 8).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      'h-8 flex-shrink-0 rounded-sm2 border px-2.5 text-[12.5px] font-semibold transition-colors sm:h-6 sm:px-2 sm:text-[11.5px]',
                      category === c ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft hover:text-ink'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <FormField label="HSN/SAC" optional htmlFor="product-hsn" span={2} half error={fe('hsn')} help="Printed on invoices.">
              <Input id="product-hsn" name="hsn" inputMode="numeric" defaultValue={product?.hsn ?? ''} placeholder="21050000" className="font-mono" />
            </FormField>
            <FormField label="Short description" optional htmlFor="product-desc" span={4} error={fe('desc')}>
              <Input id="product-desc" name="desc" defaultValue={product?.desc ?? ''} placeholder="e.g. 100 ml cup · 12 cups a box" />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection id="pricing" n={2} title="Pricing & units" aside="The first unit is how stock is counted" done={sections[1].done}>
          <div className="hidden grid-cols-[104px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_32px] gap-x-2.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-faint sm:grid">
            <span>Unit</span>
            <span>Price</span>
            <span>Pieces in 1</span>
            <span>Per piece</span>
            <span />
          </div>
          <div className="space-y-2.5 sm:space-y-2">
            {tiers.map((t, i) => {
              const approxLabel = approxQtyLabel(t.unit);
              const each = parseFloat(t.approxQty);
              const price = parseFloat(t.price);
              // What the tier works out to per piece — e.g. a Box at ₹450
              // holding ≈40 pieces is "≈ ₹11.25" — so bulk prices compare
              // at a glance. Display only; never sent to the server.
              const perPiece = approxLabel && each > 0 && price > 0 ? price / each : null;
              const asMain = i > 0 && pieces > 1 && !isPieceUnit(t.unit) && t.unit.trim().toLowerCase() !== shape.unit.trim().toLowerCase() && each > 0 ? formatStock(unitFactor(shape, t.unit), shape) : null;
              const remove = (
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  disabled={tiers.length === 1}
                  aria-label={`Remove ${formatUnit(t.unit)}`}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 text-ink-faint transition-colors hover:bg-brand-light hover:text-brand-dark disabled:pointer-events-none disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              );
              return (
                <div
                  key={i}
                  className="grid grid-cols-2 gap-2.5 rounded-md2 border border-line p-3 sm:grid-cols-[104px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_32px] sm:items-center sm:gap-x-2.5 sm:rounded-none sm:border-0 sm:p-0"
                >
                  <div>
                    <label htmlFor={`tier-unit-${i}`} className="mb-1 block text-[12.5px] font-semibold text-ink-body sm:sr-only">
                      Unit {i + 1}
                    </label>
                    <select id={`tier-unit-${i}`} value={t.unit} onChange={(e) => updateTier(i, { unit: e.target.value })} className={selectClass}>
                      {(UNITS.includes(t.unit) ? UNITS : [t.unit, ...UNITS]).map((u) => (
                        <option key={u} value={u}>
                          {formatUnit(u)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`tier-price-${i}`} className="mb-1 block text-[12.5px] font-semibold text-ink-body sm:sr-only">
                      Price per {formatUnit(t.unit)}
                    </label>
                    <AffixInput
                      id={`tier-price-${i}`}
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      before="₹"
                      value={t.price}
                      onChange={(e) => updateTier(i, { price: e.target.value })}
                      invalid={!!fe('tiers') && !(price > 0)}
                      placeholder="0.00"
                      className="font-mono"
                    />
                  </div>
                  {approxLabel ? (
                    <div>
                      <label htmlFor={`tier-qty-${i}`} className="mb-1 block text-[12.5px] font-semibold text-ink-body sm:sr-only">
                        {approxLabel}
                      </label>
                      <AffixInput
                        id={`tier-qty-${i}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        after="pcs"
                        value={t.approxQty}
                        onChange={(e) => updateTier(i, { approxQty: e.target.value })}
                        invalid={i === 0 && packSizeMissing}
                        placeholder={i === 0 && tracked ? 'Needed' : 'Optional'}
                        className="font-mono"
                      />
                    </div>
                  ) : (
                    <span className="hidden text-[12px] text-ink-faint sm:block">—</span>
                  )}
                  <div className={cn('flex min-w-0 items-center gap-2', approxLabel ? 'col-span-1 sm:col-span-1' : 'col-span-2 sm:col-span-1')}>
                    <span className="min-w-0 truncate font-mono text-[12px] text-ink-soft">
                      {perPiece != null ? `≈ ${fmtInr(perPiece)}` : ''}
                      {asMain ? `${perPiece != null ? ' · ' : ''}= ${asMain}` : ''}
                    </span>
                    {i === 0 && <Tag tone="dark">Main</Tag>}
                    <span className="ml-auto sm:hidden">{remove}</span>
                  </div>
                  <span className="hidden sm:block">{remove}</span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={addTier}
            className="mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-sm2 border border-dashed border-line text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand sm:h-9 sm:text-[12px]"
          >
            <Plus size={14} /> Add another unit
          </button>
          {fe('tiers') && <p className="mt-1.5 text-[12px] font-semibold text-red sm:text-[11px]">{fe('tiers')}</p>}
          <FormGrid className="mt-3.5">
            <FormField label="Discount" optional htmlFor="product-discount" span={2} error={fe('discount')}>
              <AffixInput
                id="product-discount"
                name="discount"
                type="number"
                min="0"
                max="100"
                step="any"
                inputMode="decimal"
                after="%"
                placeholder="0"
                defaultValue={product && Number(product.discount) > 0 ? String(Number(product.discount)) : ''}
                invalid={!!fe('discount')}
                className="text-right font-mono"
              />
            </FormField>
            <p className="col-span-2 self-end rounded-sm2 bg-surface-alt px-3 py-2 text-[12px] leading-snug text-ink-soft sm:col-span-4 sm:text-[11.5px]">
              {discount > 0 ? `Each new invoice line starts at ${discount}% off` : 'Each new invoice line starts at this discount'} — still editable on the invoice.
            </p>
          </FormGrid>
        </FormSection>

        {inventoryOn && (
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
          hint={conversionHint(shape, openingTotal)}
          error={fe}
          done={sections[2].done}
        />
        )}

        <FormSection id="photos" n={inventoryOn ? 4 : 3} title="Photos" aside="Shown while billing · up to 6" done={photoCount > 0}>
          <ProductImagesField value={images} onChange={setImages} />
        </FormSection>
      </FormSheet>

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
    </>
  );
}

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
  error,
  done,
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
  error: (field: string) => string | undefined;
  done: boolean;
}) {
  const lowStockField = (
    <FormGrid className="mt-3.5">
      <FormField label="Low-stock alert at" optional htmlFor="lowStockAt" span={2} error={error('lowStockAt')}>
        <AffixInput
          id="lowStockAt"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          after={mainUnit}
          value={lowStockAt}
          onChange={(e) => onLowStockAtChange(e.target.value)}
          invalid={!!error('lowStockAt')}
          className="text-right font-mono"
        />
      </FormField>
      <p className="col-span-2 self-end pb-1 text-[12px] text-ink-faint sm:col-span-4 sm:pb-2.5 sm:text-[11px]">Shows amber on Inventory at or below this.</p>
    </FormGrid>
  );

  if (mode === 'edit' && product) {
    const tracked = !!product.trackStock;
    return (
      <FormSection id="stock" n={3} title="Stock" aside={tracked ? 'Changes go through Inventory, so each is recorded' : undefined} done={done}>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm2 border border-line bg-bg px-3 py-2.5">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="text-ink-faint">{tracked ? 'In stock' : 'Stock'}</span>
            <StockBadge product={{ ...product, trackStock: tracked, stockQty: product.stockQty ?? 0 }} />
          </div>
          <Link href={`/inventory/${product.id}`} className="flex items-center gap-1 text-[12px] font-bold text-brand hover:underline">
            <History size={12} /> {tracked ? 'View stock history' : 'Start tracking in Inventory'}
          </Link>
        </div>
        {tracked && lowStockField}
      </FormSection>
    );
  }

  return (
    <FormSection id="stock" n={3} title="Stock" aside="Optional · turn on to track" done={done}>
      <label className="flex cursor-pointer items-center gap-3 rounded-sm2 border border-line bg-bg px-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-ink sm:text-[12.5px]">Track stock</span>
          <span className="block text-[12px] text-ink-soft sm:text-[11px]">Every saved invoice, drafts included, takes it out of stock.</span>
        </span>
        <Switch checked={trackStock} onChange={(e) => onTrackStockChange(e.target.checked)} aria-label="Track stock" />
      </label>
      {trackStock ? (
        <>
          <div className="mt-3.5">
            <p className="mb-[5px] flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-body sm:text-[11.5px]">
              Opening stock <span className="font-medium text-ink-faint">what you have now, in any units</span>
            </p>
            <MixedQtyInput product={shape} values={openingStock} onChange={onOpeningStockChange} idPrefix="openingStock" invalid={!!error('openingStock')} />
            {error('openingStock') ? (
              <p className="mt-[5px] text-[12px] font-semibold text-red sm:text-[11px]">{error('openingStock')}</p>
            ) : (
              <p className="mt-[5px] text-[12px] text-ink-faint sm:text-[11px]">Leave empty to start at 0 and add stock later.</p>
            )}
          </div>
          {lowStockField}
          {hint && <p className="mt-3 rounded-sm2 bg-surface-alt px-3 py-2 text-[12px] leading-snug text-ink-soft sm:text-[11.5px]">{hint}</p>}
        </>
      ) : (
        <p className="mt-2 text-[12px] text-ink-faint sm:text-[11.5px]">Not tracked. Invoices won&apos;t check stock for this product. You can start tracking later from Inventory.</p>
      )}
    </FormSection>
  );
}
