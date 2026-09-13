'use client';

import { useState } from 'react';
import { Package, Tag, Ruler, IndianRupee, Boxes, FileText, Eye, EyeOff, Trash2, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogFormContent, DialogFormHeader, DialogFormIcon, DialogFormBody, DialogFormFooter } from '@/components/ui/dialog';
import { fmtInr } from '@/lib/gst';
import { useCreateProduct, useUpdateProduct, useDeleteProduct, useToggleProductActive } from '@/hooks/use-products';
import { CategoryCombobox } from '@/components/products/category-combobox';
import { ProductImagesField, type PendingImages } from '@/components/products/product-images-field';

const UNITS = ['Piece', 'kg', 'bag', 'box', 'block', 'slab'];

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
  const [category, setCategory] = useState(product?.category ?? '');
  const [unit, setUnit] = useState(product?.unit ?? prefill?.unit ?? 'kg');
  const [price, setPrice] = useState(product?.price?.toString() ?? prefill?.price ?? '');
  const [packQty, setPackQty] = useState(product?.packQty?.toString() ?? '');
  const [images, setImages] = useState<PendingImages>({ existing: product?.images ?? [], files: [] });
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(product?.id ?? '');
  const deleteProduct = useDeleteProduct();
  const toggleActive = useToggleProductActive();
  const pending = createProduct.isPending || updateProduct.isPending;

  const priceNum = parseFloat(price) || 0;
  const packQtyNum = parseInt(packQty, 10) || 0;
  const perPiece = priceNum > 0 && packQtyNum > 0 ? priceNum / packQtyNum : null;

  function resetForCreate() {
    setCategory('');
    setUnit('kg');
    setPrice('');
    setPackQty('');
    setImages({ existing: [], files: [] });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogFormContent>
        <form onSubmit={handleSubmit} className="contents">
          <DialogFormHeader>
            <DialogFormIcon>{mode === 'create' ? <Sparkles size={16} /> : <Package size={16} />}</DialogFormIcon>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-extrabold text-ink">{mode === 'create' ? 'New product' : product?.name}</div>
              <div className="text-[11.5px] text-ink-faint">{mode === 'create' ? 'Add an item to your catalog' : 'Edit product details'}</div>
            </div>
            {mode === 'edit' && product && (
              <label className="flex flex-shrink-0 cursor-pointer items-center gap-2">
                {product.active ? <Eye size={13} className="text-green" /> : <EyeOff size={13} className="text-ink-faint" />}
                <span className={`text-[11px] font-bold ${product.active ? 'text-green' : 'text-ink-faint'}`}>{product.active ? 'Live' : 'Hidden'}</span>
                <Switch checked={product.active} onChange={() => toggleActive.mutate(product.id)} />
              </label>
            )}
          </DialogFormHeader>

          <DialogFormBody>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" name="name" icon={Package} defaultValue={product?.name ?? prefill?.name} error={fieldErrors.name} />
              <div>
                <CategoryCombobox name="category" value={category} onChange={setCategory} />
                {fieldErrors.category && <p className="mt-1 text-[11px] font-semibold text-destructive">{fieldErrors.category}</p>}
              </div>
              <Field
                as="select"
                label="Unit"
                name="unit"
                icon={Ruler}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                options={(UNITS.includes(unit) ? UNITS : [unit, ...UNITS]).map((u) => ({ value: u }))}
              />
              <div>
                <Field label="Price per unit (₹)" name="price" type="number" icon={IndianRupee} mono value={price} onChange={(e) => setPrice(e.target.value)} error={fieldErrors.price} />
              </div>
              {unit !== 'Piece' && (
                <div>
                  <Field
                    label={`Pieces per ${unit} (approx, optional)`}
                    name="packQty"
                    type="number"
                    icon={Boxes}
                    mono
                    value={packQty}
                    onChange={(e) => setPackQty(e.target.value)}
                  />
                  {perPiece !== null && <p className="mt-1 text-[11px] font-bold text-brand-dark">≈ {fmtInr(perPiece)} per piece</p>}
                </div>
              )}
              <div className="col-span-2">
                <Field label="Short description" name="desc" icon={FileText} defaultValue={product?.desc ?? ''} />
              </div>
              <div className="col-span-2">
                <ProductImagesField value={images} onChange={setImages} />
              </div>
            </div>
            {error && <p className="mt-3 text-[12.5px] font-bold text-destructive">{error}</p>}
          </DialogFormBody>

          <DialogFormFooter>
            {mode === 'edit' && (
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)} className="mr-auto border-brand-light text-brand-dark hover:bg-brand-light">
                <Trash2 size={13} /> Delete
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <Check size={13} /> {pending ? 'Saving…' : mode === 'create' ? 'Add product' : 'Save changes'}
            </Button>
          </DialogFormFooter>
        </form>
      </DialogFormContent>

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
    </Dialog>
  );
}
