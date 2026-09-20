'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Package, Pencil, Trash2, Eye, EyeOff, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetIcon, SheetBody, SheetTitle } from '@/components/ui/sheet';
import { ZoomableImage } from '@/components/ui/image-lightbox';
import { fmtInr, formatUnit } from '@/lib/gst';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useProductsPage, useProductCategories, useDeleteProduct, useToggleProductActive } from '@/hooks/use-products';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import type { ProductSort } from '@/actions/products';

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
  priceTiers?: PriceTier[];
};

/** Every pricing option for a product — falls back to a single synthetic
 * tier built from unit/price/packQty if a product somehow has none (same
 * fallback as the invoice builder's own tiersFor). */
function tiersFor(p: Product): PriceTier[] {
  if (p.priceTiers && p.priceTiers.length > 0) return p.priceTiers;
  return [{ unit: p.unit, price: p.price, approxQty: p.packQty }];
}

const PAGE_SIZE = 10;

export function ProductsClient({ initialData }: { initialData: { items: Product[]; total: number } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [category, setCategory] = useState('all');
  const [liveOnly, setLiveOnly] = useState(false);
  const [sort, setSort] = useState<ProductSort>('name');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{ name?: string; unit?: string; price?: string } | undefined>();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const deleteProduct = useDeleteProduct();

  // Arriving from the dashboard's "you keep billing this by hand" nudge —
  // open the add-product sheet pre-filled instead of a blank form.
  useEffect(() => {
    const name = searchParams.get('addName');
    if (!name) return;
    setAddPrefill({
      name,
      unit: searchParams.get('addUnit') ?? undefined,
      price: searchParams.get('addRate') ?? undefined,
    });
    setAddOpen(true);
    router.replace('/products');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setPage(1), [search, category, liveOnly, sort]);

  const isDefaultParams = search === '' && category === 'all' && !liveOnly && sort === 'name' && page === 1;
  const { data, isFetching, isLoading } = useProductsPage(
    { search, category, activeOnly: liveOnly, sort, page, pageSize: PAGE_SIZE },
    isDefaultParams ? initialData : undefined
  );
  const items = (data?.items ?? []) as Product[];
  const total = data?.total ?? 0;
  const { data: categories = [] } = useProductCategories();

  const selected = items.find((p) => p.id === selectedId) ?? null;
  const deleteTarget = items.find((p) => p.id === deleteTargetId) ?? null;

  function openView(id: string) {
    setSelectedId(id);
    setViewOpen(true);
  }

  function openEdit(id: string) {
    setSelectedId(id);
    setEditOpen(true);
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    try {
      await deleteProduct.mutateAsync(deleteTargetId);
      toast.success('Product removed');
      if (selectedId === deleteTargetId) {
        setSelectedId(null);
        setViewOpen(false);
        setEditOpen(false);
      }
      setDeleteTargetId(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
            <Package size={18} className="text-brand" /> Products
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Your catalog of ice products, prices and units — what shows up when building an invoice.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={13} /> Add product
        </Button>
      </div>

      <div className={`mb-4 space-y-2.5 rounded-xl2 border border-line bg-surface p-3.5 shadow-card transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search products…" className="max-w-[260px]" />
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {['all', ...categories].map((c) => (
                <Button key={c} type="button" size="sm" variant={category === c ? 'default' : 'outline'} onClick={() => setCategory(c)}>
                  {c === 'all' ? 'All' : c}
                </Button>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-soft">
              <Switch checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} /> Live only
            </label>
            <Select value={sort} onValueChange={(v) => setSort(v as ProductSort)}>
              <SelectTrigger className="h-8 w-[150px] text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="price-asc">Price: low-high</SelectItem>
                <SelectItem value="price-desc">Price: high-low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable cols={5} />
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-line bg-surface py-16 text-center text-ink-faint shadow-card">
          <Package size={34} />
          <p className="text-[13.5px] font-bold text-ink-soft">No products match your filters.</p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={13} /> Add a new product
          </Button>
        </div>
      ) : (
        <div className="shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Units</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => {
                const tiers = tiersFor(p);
                return (
                <TableRow key={p.id} onClick={() => openView(p.id)} className={`cursor-pointer ${!p.active ? 'opacity-50' : ''}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-sm2 ${
                          p.images[0] ? 'bg-surface-alt text-ink-soft' : 'border border-dashed border-gold bg-gold-soft text-gold'
                        }`}
                        title={p.images[0] ? undefined : 'No photo added yet'}
                      >
                        {p.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff size={14} />
                        )}
                      </span>
                      <span className="truncate text-[13px] font-bold text-ink">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-ink-soft">{p.category}</TableCell>
                  {/* Every pricing option, not just the primary tier — a
                      product sold as both Box and Piece showed only "Piece"
                      here before, hiding that a bulk option even existed. */}
                  <TableCell className="text-ink-soft">{tiers.map((t) => formatUnit(t.unit)).join(' · ')}</TableCell>
                  <TableCell className="font-mono font-bold text-ink-soft">{tiers.map((t) => fmtInr(Number(t.price))).join(' · ')}</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? 'green' : 'outline'}>{p.active ? 'Live' : 'Hidden'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="View product"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          openView(p.id);
                        }}
                      >
                        <Eye size={14} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Edit product"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(p.id);
                        }}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Delete product"
                        className="h-8 w-8 hover:bg-brand-light hover:text-brand-dark"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetId(p.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <ProductFormDialog
        key={addPrefill?.name ?? 'blank'}
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setAddPrefill(undefined);
        }}
        mode="create"
        prefill={addPrefill}
      />

      {selected && (
        <ProductViewSheet
          key={`view-${selected.id}`}
          product={selected}
          open={viewOpen}
          onOpenChange={setViewOpen}
          onEdit={() => {
            setViewOpen(false);
            setEditOpen(true);
          }}
          onDeleteClick={() => setDeleteTargetId(selected.id)}
        />
      )}
      {selected && <ProductFormDialog key={`edit-${selected.id}`} open={editOpen} onOpenChange={setEditOpen} mode="edit" product={selected} />}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="Remove product"
        description={
          <>
            Remove <b className="font-bold text-ink">{deleteTarget?.name}</b> from the catalog? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete product"
        pending={deleteProduct.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function ProductViewSheet({
  product,
  open,
  onOpenChange,
  onEdit,
  onDeleteClick,
}: {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDeleteClick: () => void;
}) {
  const toggleActive = useToggleProductActive();

  const tiers = tiersFor(product);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetIcon>
            {product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.images[0]} alt="" className="h-full w-full rounded-sm2 object-cover" />
            ) : (
              <ImageOff size={16} />
            )}
          </SheetIcon>
          <div className="min-w-0 flex-1">
            <SheetTitle>{product.name}</SheetTitle>
            <p className="truncate text-[11.5px] text-ink-faint">
              {product.category} · {tiers.map((t) => formatUnit(t.unit)).join(', ')}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <Pencil size={13} /> Edit
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onDeleteClick} className="border-red-soft text-red hover:bg-red-soft">
              <Trash2 size={13} />
            </Button>
          </div>
        </SheetHeader>

        <SheetBody>
          {product.images.length > 1 && (
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {product.images.map((url) => (
                <span key={url} className="block h-16 w-16 flex-shrink-0 overflow-hidden rounded-md2 border border-line">
                  <ZoomableImage src={url} alt={product.name} />
                </span>
              ))}
            </div>
          )}

          <div className="mb-4 overflow-hidden rounded-lg2 border border-line">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line bg-surface-alt">
                  <th className="p-2.5 text-left text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">Unit</th>
                  <th className="p-2.5 text-right text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">Price</th>
                  <th className="p-2.5 text-right text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">Approx Qty</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) => {
                  const approxQty = t.approxQty != null && Number(t.approxQty) > 0 ? Number(t.approxQty) : null;
                  const price = Number(t.price);
                  // Same "price ÷ approx qty" comparison shown while editing —
                  // purely a derived display, approxQty is never a minimum.
                  const perPiece = approxQty && price > 0 ? price / approxQty : null;
                  return (
                    <tr key={t.id ?? i} className="border-b border-line last:border-0">
                      <td className="p-2.5 font-bold text-ink">{formatUnit(t.unit)}</td>
                      <td className="p-2.5 text-right">
                        <div className="font-mono font-bold text-ink-soft">{fmtInr(price)}</div>
                        {perPiece != null && <div className="font-mono text-[10.5px] text-ink-faint">≈{fmtInr(perPiece)}/Piece</div>}
                      </td>
                      <td className="p-2.5 text-right font-mono text-ink-faint">{approxQty ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded-lg2 border border-dashed border-line p-3.5 text-[12.5px]">
            {product.desc && (
              <div className="flex justify-between gap-3">
                <span className="flex-shrink-0 text-ink-faint">Description</span>
                <span className="text-right font-semibold text-ink-body">{product.desc}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-ink-faint">Status</span>
              <label className="flex cursor-pointer items-center gap-2">
                {product.active ? <Eye size={13} className="text-green" /> : <EyeOff size={13} className="text-ink-faint" />}
                <span className={`font-bold ${product.active ? 'text-green' : 'text-ink-faint'}`}>{product.active ? 'Live' : 'Hidden'}</span>
                <Switch checked={product.active} disabled={toggleActive.isPending} onChange={() => toggleActive.mutate(product.id)} />
              </label>
            </div>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

