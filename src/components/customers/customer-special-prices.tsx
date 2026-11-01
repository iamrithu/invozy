'use client';

import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Search, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtInr, formatUnit } from '@/lib/gst';
import { useCustomerPrices, useDeleteCustomerPrice, useSetCustomerPrice } from '@/hooks/use-pricing';
import { useProductOptions, type ProductOption } from '@/hooks/use-products';
import type { CustomerPriceRow } from '@/actions/pricing';

type Draft = { productId: string; productName?: string; unit: string; price: string };

/** The "Special prices" section of the customer detail sheet — prices this
 * customer pays instead of the catalog rate, per product + unit. The
 * invoice builder applies them automatically once the customer is on the
 * bill. Tapping a row edits it; saving the same product + unit again just
 * replaces the price. */
export function CustomerSpecialPrices({ customerId }: { customerId: string }) {
  const { data: rows, isLoading } = useCustomerPrices(customerId);
  const deletePrice = useDeleteCustomerPrice();
  const [draft, setDraft] = useState<Draft | null>(null);

  async function remove(row: CustomerPriceRow) {
    try {
      await deletePrice.mutateAsync(row.id);
      toast.success(`Removed the special price for ${row.productName}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <section className="mt-6">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] font-extrabold text-ink">
          <Tag size={13} /> Special prices {rows && rows.length > 0 && <span className="font-mono text-ink-faint">{rows.length}</span>}
        </div>
        {!draft && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ productId: '', unit: '', price: '' })}>
            <Plus size={13} /> Add
          </Button>
        )}
      </div>
      <p className="mb-2 text-[11px] text-ink-faint">Used instead of the catalog price when you bill this customer.</p>

      {draft && <PriceForm key={`${draft.productId}-${draft.unit}`} customerId={customerId} initial={draft} onDone={() => setDraft(null)} />}

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : !rows || rows.length === 0 ? (
        !draft && <p className="rounded-lg2 border border-dashed border-line p-3 text-center text-[12px] text-ink-faint">None yet. This customer pays catalog prices.</p>
      ) : (
        <div className="overflow-hidden rounded-lg2 border border-line">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2 border-b border-line px-2.5 py-2 text-[12.5px] last:border-0">
              <button
                type="button"
                onClick={() => setDraft({ productId: row.productId, productName: row.productName, unit: row.unit, price: String(row.price) })}
                className="min-w-0 flex-1 text-left"
                aria-label={`Edit special price for ${row.productName}`}
              >
                <div className={`truncate font-bold ${row.productActive ? 'text-ink' : 'text-ink-faint'}`}>
                  {row.productName}
                  {!row.productActive && <span className="ml-1.5 text-[10px] font-semibold">(hidden)</span>}
                </div>
                <div className="text-[11px] text-ink-faint">
                  per {formatUnit(row.unit)}
                  {row.catalogPrice != null && row.catalogPrice !== row.price && <> · catalog {fmtInr(row.catalogPrice)}</>}
                </div>
              </button>
              <span className="font-mono font-extrabold text-ink">{fmtInr(row.price)}</span>
              <button
                type="button"
                onClick={() => setDraft({ productId: row.productId, productName: row.productName, unit: row.unit, price: String(row.price) })}
                aria-label="Edit"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 text-ink-faint hover:bg-surface-alt hover:text-ink"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={() => remove(row)}
                disabled={deletePrice.isPending}
                aria-label={`Remove special price for ${row.productName}`}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 text-ink-faint hover:bg-red-soft hover:text-red disabled:opacity-40"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function tiersOf(p: ProductOption) {
  return p.priceTiers.length > 0 ? p.priceTiers : [{ unit: p.unit, price: p.price, approxQty: null }];
}

/** Product search → unit (from that product's pricing options) → price. */
function PriceForm({ customerId, initial, onDone }: { customerId: string; initial: Draft; onDone: () => void }) {
  const { data: products, isLoading } = useProductOptions();
  const setPrice = useSetCustomerPrice();
  const [query, setQuery] = useState('');
  const [productId, setProductId] = useState(initial.productId);
  const [unit, setUnit] = useState(initial.unit);
  const [price, setPriceText] = useState(initial.price);

  // Editing a row keeps its product even when that product is hidden (and
  // so missing from the live catalog list) — only the price can change.
  const listed = products?.find((p) => p.id === productId) ?? null;
  const editing = !!initial.productId;
  const product: { name: string } | null = listed ?? (editing ? { name: initial.productName ?? '' } : null);
  const units: { unit: string; price: string }[] = listed ? tiersOf(listed) : editing ? [{ unit: initial.unit, price: '' }] : [];
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!products) return [];
    return (q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) : products).slice(0, 6);
  }, [products, query]);

  function pick(p: ProductOption) {
    const first = tiersOf(p)[0];
    setProductId(p.id);
    setUnit(first.unit);
    setPriceText(String(Number(first.price)));
    setQuery('');
  }

  function pickUnit(u: string) {
    setUnit(u);
    const tier = units.find((t) => t.unit === u);
    if (tier && !editing) setPriceText(String(Number(tier.price)));
  }

  async function save() {
    const value = Number(price);
    if (!productId || !unit) return toast.error('Pick a product and a unit.');
    if (!price.trim() || !Number.isFinite(value) || value < 0) return toast.error('Enter a price of 0 or more.');
    try {
      await setPrice.mutateAsync({ customerId, productId, unit, price: value });
      toast.success('Special price saved');
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const catalog = listed ? units.find((t) => t.unit === unit) : undefined;

  return (
    <div className="mb-2.5 space-y-2.5 rounded-lg2 border border-line bg-bg p-3">
      {product ? (
        <div className="flex items-center justify-between gap-2 rounded-sm2 bg-surface px-2.5 py-2">
          <span className="min-w-0 truncate text-[12.5px] font-bold text-ink">{product.name}</span>
          {!editing && (
            <button type="button" onClick={() => setProductId('')} className="flex-shrink-0 text-[11px] font-bold text-brand hover:underline">
              Change
            </button>
          )}
        </div>
      ) : editing && isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <div>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="pl-8" />
          </div>
          <div className="mt-1.5 max-h-[220px] overflow-y-auto rounded-sm2 border border-line bg-surface">
            {isLoading ? (
              <div className="p-2.5 text-[12px] text-ink-faint">Loading products…</div>
            ) : matches.length === 0 ? (
              <div className="p-2.5 text-[12px] text-ink-faint">No products match.</div>
            ) : (
              matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className="flex w-full items-center justify-between gap-2 border-b border-line px-2.5 py-2 text-left text-[12.5px] last:border-0 hover:bg-surface-alt"
                >
                  <span className="min-w-0 truncate font-semibold text-ink">{p.name}</span>
                  <span className="flex-shrink-0 font-mono text-[11px] text-ink-faint">{fmtInr(Number(p.price))}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {product && (
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Unit</label>
            <select
              value={unit}
              onChange={(e) => pickUnit(e.target.value)}
              disabled={editing}
              className="w-full rounded-sm2 border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            >
              {units.map((t) => (
                <option key={t.unit} value={t.unit}>
                  {formatUnit(t.unit)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Their price (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPriceText(e.target.value)}
              className="w-full rounded-sm2 border border-line bg-surface px-2.5 py-2 font-mono text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {catalog && <p className="col-span-2 -mt-1 text-[11px] text-ink-faint">Catalog price: {fmtInr(Number(catalog.price))} per {formatUnit(catalog.unit)}</p>}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!product || setPrice.isPending}>
          <Check size={13} /> {setPrice.isPending ? 'Saving…' : 'Save price'}
        </Button>
      </div>
    </div>
  );
}
