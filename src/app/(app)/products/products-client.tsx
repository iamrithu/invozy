'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Package, Pencil, Trash2, Eye, EyeOff, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ZoomableImage } from '@/components/ui/image-lightbox';
import { fmtInr } from '@/lib/gst';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useProductsPage, useProductCategories, useDeleteProduct, useToggleProductActive } from '@/hooks/use-products';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import type { ProductSort } from '@/actions/products';

type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  price: string | number;
  hsn: string;
  packQty: number | null;
  active: boolean;
  desc: string | null;
  images: string[];
};

const PAGE_SIZE = 20;

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
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{ name?: string; hsn?: string; unit?: string; price?: string } | undefined>();

  // Arriving from the dashboard's "you keep billing this by hand" nudge —
  // open the add-product dialog pre-filled instead of a blank form.
  useEffect(() => {
    const name = searchParams.get('addName');
    if (!name) return;
    setAddPrefill({
      name,
      hsn: searchParams.get('addHsn') ?? undefined,
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

  const grouped = useMemo(() => {
    if (sort !== 'name') return [{ category: null as string | null, items }];
    const groups: { category: string | null; items: Product[] }[] = [];
    for (const p of items) {
      const g = groups.find((g) => g.category === p.category);
      if (g) g.items.push(p);
      else groups.push({ category: p.category, items: [p] });
    }
    return groups;
  }, [items, sort]);

  const selected = items.find((p) => p.id === selectedId) ?? null;

  function selectRow(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[330px_1fr]">
        <div className="flex max-h-[74vh] flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className={`flex-1 overflow-y-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            <div className="sticky top-0 z-[2] space-y-2 border-b border-line bg-surface p-3">
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search products…" />
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {['all', ...categories].map((c) => (
                    <Button key={c} type="button" size="sm" variant={category === c ? 'default' : 'outline'} onClick={() => setCategory(c)}>
                      {c === 'all' ? 'All' : c}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-soft">
                  <Switch checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} /> Live only
                </label>
                <Select value={sort} onValueChange={(v) => setSort(v as ProductSort)}>
                  <SelectTrigger className="h-8 w-[132px] text-[11.5px]">
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
            {isLoading ? (
              <SkeletonList />
            ) : (
              <>
                {total === 0 && <div className="p-6 text-center text-[13px] text-ink-faint">No products match your filters.</div>}
                {grouped.map((g, gi) => (
                  <div key={g.category ?? gi}>
                    {g.category && (
                      <div className="sticky top-[93px] z-[1] bg-surface-alt px-3.5 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-soft">{g.category}</div>
                    )}
                    {g.items.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectRow(p.id)}
                        className={`flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-0 hover:bg-bg ${
                          selectedId === p.id ? 'bg-brand-light shadow-[inset_3px_0_0_theme(colors.brand.DEFAULT)]' : ''
                        } ${!p.active ? 'opacity-50' : ''}`}
                      >
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
                        <span className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-bold text-ink">{p.name}</div>
                          <div className="truncate text-[11px] text-ink-faint">
                            {p.unit}
                            {!p.active ? ' · hidden' : ''}
                          </div>
                        </span>
                        <span className="flex-shrink-0 font-mono text-[11.5px] font-bold text-ink-soft">{fmtInr(Number(p.price))}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>

        <div className="rounded-xl2 border border-line bg-surface p-5 shadow-card">
          {selected ? (
            <ProductDetail key={selected.id} product={selected} onEdit={() => setEditOpen(true)} onDeleted={() => setSelectedId(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-ink-faint">
              <Package size={34} />
              <p className="text-[13.5px] font-bold text-ink-soft">Select a product on the left to view and edit it</p>
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={13} /> Add a new product
              </Button>
            </div>
          )}
        </div>
      </div>

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
      {selected && <ProductFormDialog key={selected.id} open={editOpen} onOpenChange={setEditOpen} mode="edit" product={selected} />}
    </div>
  );
}

function ProductDetail({ product, onEdit, onDeleted }: { product: Product; onEdit: () => void; onDeleted: () => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteProduct = useDeleteProduct();
  const toggleActive = useToggleProductActive();

  async function handleDelete() {
    try {
      await deleteProduct.mutateAsync(product.id);
      setDeleteOpen(false);
      toast.success('Product removed');
      onDeleted();
    } catch (e: any) {
      setDeleteOpen(false);
      toast.error(e.message);
    }
  }

  const perPiece = product.packQty && Number(product.price) > 0 ? Number(product.price) / product.packQty : null;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg2 ${
              product.images[0] ? 'bg-surface-alt text-ink-soft' : 'border border-dashed border-gold bg-gold-soft text-gold'
            }`}
            title={product.images[0] ? undefined : 'No photo added yet'}
          >
            {product.images[0] ? <ZoomableImage src={product.images[0]} alt={product.name} /> : <ImageOff size={22} />}
          </span>
          <div>
            <h3 className="text-[17px] font-extrabold text-ink">{product.name}</h3>
            <p className="text-[12px] text-ink-soft">
              {product.category} · {product.unit}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil size={13} /> Edit
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="border-brand-light text-brand-dark hover:bg-brand-light">
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {product.images.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {product.images.map((url) => (
            <span key={url} className="block h-16 w-16 flex-shrink-0 overflow-hidden rounded-md2 border border-line">
              <ZoomableImage src={url} alt={product.name} />
            </span>
          ))}
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <Stat label="Price" value={fmtInr(Number(product.price))} />
        <Stat label="Per piece" value={perPiece !== null ? fmtInr(perPiece) : '—'} />
        <Stat label="HSN" value={product.hsn} mono />
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
            <Switch checked={product.active} onChange={() => toggleActive.mutate(product.id)} />
          </label>
        </div>
      </div>

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
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md2 bg-bg p-2.5 text-center">
      <div className={`text-[14px] font-extrabold text-ink ${mono ? 'font-mono' : ''}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
