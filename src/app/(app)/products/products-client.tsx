'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Package, Pencil, Trash2, Eye, EyeOff, ImageOff, MoreHorizontal, History, Boxes } from 'lucide-react';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ZoomableImage } from '@/components/ui/image-lightbox';
import { fmtInr, formatUnit } from '@/lib/gst';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useProductsPage, useProductCategories, useDeleteProduct, useToggleProductActive } from '@/hooks/use-products';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { ProductOffers } from '@/components/products/product-offers';
import { StockBadge } from '@/components/products/stock-badge';
import type { ProductSort } from '@/actions/products';
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
  trackStock: boolean;
  stockQty: string | number;
  lowStockAt: string | number | null;
  discount?: string | number;
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
  // Inventory off (src/lib/modules.ts): no stock column, badges or history links.
  const inventoryOn = useModules().enabled('inventory');
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [category, setCategory] = useState('all');
  const [liveOnly, setLiveOnly] = useState(false);
  const [sort, setSort] = useState<ProductSort>('name');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Product | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{ name?: string; unit?: string; price?: string } | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const deleteProduct = useDeleteProduct();
  const toggleActive = useToggleProductActive();

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

  // The fresh list row when it's on this page, else the copy taken on
  // click — hiding a product under "Live only" drops it from the page while
  // its sheet is still open, which used to unmount the sheet mid-action.
  const selected = items.find((p) => p.id === selectedId) ?? (snapshot?.id === selectedId ? snapshot : null);

  function openView(p: Product) {
    setSnapshot(p);
    setSelectedId(p.id);
    setViewOpen(true);
  }

  function openEdit(p: Product) {
    setSnapshot(p);
    setSelectedId(p.id);
    setEditOpen(true);
  }

  async function setLive(p: Product, active: boolean) {
    try {
      await toggleActive.mutateAsync({ id: p.id, active });
      toast.success(active ? `${p.name} is live` : `${p.name} hidden from new invoices`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Closes on failure too — the toast carries the reason.
  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await deleteProduct.mutateAsync(target.id);
      toast.success(`${target.name} deleted`);
      if (selectedId === target.id) {
        setSelectedId(null);
        setViewOpen(false);
        setEditOpen(false);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
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
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden sm:table-cell">Units</TableHead>
                <TableHead>Price</TableHead>
                {inventoryOn && <TableHead>Stock</TableHead>}
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => {
                const tiers = tiersFor(p);
                return (
                <TableRow key={p.id} onClick={() => openView(p)} className={`cursor-pointer ${!p.active ? 'opacity-50' : ''}`}>
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
                  <TableCell className="hidden text-ink-soft md:table-cell">{p.category}</TableCell>
                  {/* Every pricing option, not just the primary tier — a
                      product sold as both Box and Piece showed only "Piece"
                      here before, hiding that a bulk option even existed. */}
                  <TableCell className="hidden text-ink-soft sm:table-cell">{tiers.map((t) => formatUnit(t.unit)).join(' · ')}</TableCell>
                  <TableCell className="font-mono font-bold text-ink-soft">{tiers.map((t) => fmtInr(Number(t.price))).join(' · ')}</TableCell>
                  {inventoryOn && (
                    <TableCell>
                      <StockBadge product={p} />
                    </TableCell>
                  )}
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={p.active ? 'green' : 'outline'}>{p.active ? 'Live' : 'Hidden'}</Badge>
                  </TableCell>
                  {/* Stops row clicks — the menu's portal still bubbles through here in React's tree. */}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Actions for ${p.name}`}>
                          <MoreHorizontal size={15} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={() => openView(p)}>
                          <Eye size={13} /> View details
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openEdit(p)}>
                          <Pencil size={13} /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setLive(p, !p.active)}>
                          {p.active ? <EyeOff size={13} /> : <Eye size={13} />} {p.active ? 'Hide' : 'Make live'}
                        </DropdownMenuItem>
                        {inventoryOn && (
                          <DropdownMenuItem asChild>
                            <Link href={`/inventory/${p.id}`}>
                              <History size={13} /> Stock history
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setDeleteTarget(p)} className="text-red focus:bg-red-soft focus:text-red">
                          <Trash2 size={13} /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
          onDeleteClick={() => setDeleteTarget(selected)}
          onToggleLive={(active) => setLive(selected, active)}
          toggling={toggleActive.isPending}
        />
      )}
      {selected && <ProductFormDialog key={`edit-${selected.id}`} open={editOpen} onOpenChange={setEditOpen} mode="edit" product={selected} />}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? 'product'}?`}
        description="Old invoices keep this product's name, rate and HSN. Its stock history is removed. To keep it but stop selling it, hide it instead."
        icon={Trash2}
        confirmIcon={Trash2}
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
  onToggleLive,
  toggling,
}: {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDeleteClick: () => void;
  onToggleLive: (active: boolean) => void;
  toggling: boolean;
}) {
  const inventoryOn = useModules().enabled('inventory');
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
          {product.images.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {product.images.map((url) => (
                <span key={url} className="block h-16 w-16 flex-shrink-0 overflow-hidden rounded-md2 border border-line">
                  <ZoomableImage src={url} alt={product.name} gallery={product.images} />
                </span>
              ))}
            </div>
          )}

          {inventoryOn && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg2 border border-line bg-bg px-3 py-2.5">
            <div className="flex items-center gap-2 text-[12.5px]">
              <Boxes size={13} className="text-ink-faint" />
              <span className="text-ink-faint">Stock</span>
              <StockBadge product={product} />
              {product.trackStock && product.lowStockAt != null && (
                <span className="text-[11px] text-ink-faint">
                  alert at {Number(product.lowStockAt)} {formatUnit(product.unit)}
                </span>
              )}
            </div>
            <Link href={`/inventory/${product.id}`} className="flex items-center gap-1 text-[12px] font-bold text-brand hover:underline">
              <History size={12} /> {product.trackStock ? 'Stock history' : 'Track in Inventory'}
            </Link>
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
            <div className="flex justify-between gap-3">
              <span className="flex-shrink-0 text-ink-faint">Discount</span>
              {Number(product.discount) > 0 ? (
                <span className="text-right font-semibold text-ink-body">
                  {Number(product.discount)}% <span className="font-normal text-ink-faint">· new invoice lines start at this</span>
                </span>
              ) : (
                <span className="text-ink-faint">None</span>
              )}
            </div>
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
                <Switch checked={product.active} disabled={toggling} onChange={(e) => onToggleLive(e.target.checked)} />
              </label>
            </div>
          </div>

          <ProductOffers productId={product.id} units={tiers.map((t) => t.unit)} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

