'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Minus, Package, Plus, Search, ShoppingBag } from 'lucide-react';
import { useCart } from '@/components/store/cart';
import type { StoreCategory, StoreProduct } from '@/lib/store-public';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

/** Category chips, search and the product grid. */
export function StoreCatalog({ slug, categories, products, initialCategory }: { slug: string; categories: StoreCategory[]; products: StoreProduct[]; initialCategory: string | null }) {
  const [cat, setCat] = useState<string | null>(initialCategory);
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const catId = categories.find((c) => c.slug === cat)?.id;
    return products.filter((p) => (!catId || p.categoryId === catId) && (!term || p.name.toLowerCase().includes(term)));
  }, [products, categories, cat, q]);
  const current = categories.find((c) => c.slug === cat);

  return (
    <div className="pb-28">
      {categories.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Chip on={!cat} onClick={() => setCat(null)}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} on={cat === c.slug} onClick={() => setCat(c.slug)} image={c.imageUrl}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}
      <div className="relative mb-4">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="h-11 w-full rounded-md2 border border-line bg-surface pl-9 pr-3 text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-light" aria-label="Search products" />
      </div>
      {current?.description && <p className="mb-4 text-[13px] text-ink-soft">{current.description}</p>}
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-ink-faint">
          <Package size={28} />
          <p className="text-[13.5px] font-semibold">No products match.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </ul>
      )}
      <CartBar slug={slug} products={products} />
    </div>
  );
}

function Chip({ on, onClick, image, children }: { on: boolean; onClick: () => void; image?: string | null; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn('flex h-10 flex-shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[13px] font-semibold transition-colors', on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-soft hover:text-ink', !image && 'pl-3.5')}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-7 w-7 rounded-full object-cover" />
      )}
      {children}
    </button>
  );
}

function ProductCard({ p }: { p: StoreProduct }) {
  const cart = useCart();
  const [unit, setUnit] = useState(p.units[0].unit);
  const price = p.units.find((u) => u.unit === unit)?.price ?? p.units[0].price;
  const inCart = cart.lines.find((l) => l.productId === p.id && l.unit === unit)?.qty ?? 0;
  return (
    <li className="flex flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
      <div className="flex aspect-square items-center justify-center bg-surface-alt text-ink-faint">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
        ) : (
          <Package size={32} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="text-[13.5px] font-bold leading-snug text-ink">{p.name}</div>
        {p.units.length > 1 ? (
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-8 rounded-sm2 border border-line bg-surface px-2 text-[12.5px] text-ink" aria-label={`Unit for ${p.name}`}>
            {p.units.map((u) => (
              <option key={u.unit} value={u.unit}>
                {u.unit} · {fmtInr(u.price)}
              </option>
            ))}
          </select>
        ) : null}
        {/* Wraps on narrow cards so the quantity stepper drops under the price
            instead of overflowing the card. */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <span className="whitespace-nowrap font-mono text-[14px] font-extrabold text-ink">
            {fmtInr(price)}
            <span className="text-[11px] font-semibold text-ink-faint">/{unit}</span>
          </span>
          {inCart > 0 ? (
            <span className="ml-auto flex items-center rounded-md2 border border-brand">
              <button onClick={() => cart.set(p.id, unit, inCart - 1)} className="flex h-8 w-8 items-center justify-center text-brand" aria-label={`One less ${p.name}`}>
                <Minus size={14} />
              </button>
              <span className="min-w-[24px] text-center font-mono text-[13px] font-bold text-ink">{inCart}</span>
              <button onClick={() => cart.set(p.id, unit, inCart + 1)} className="flex h-8 w-8 items-center justify-center text-brand" aria-label={`One more ${p.name}`}>
                <Plus size={14} />
              </button>
            </span>
          ) : (
            <button onClick={() => cart.set(p.id, unit, 1)} className="ml-auto h-8 rounded-md2 bg-brand px-3 text-[12.5px] font-bold text-white hover:bg-brand-dark">
              Add
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Sticky "N items · ₹X · Checkout" bar. */
export function CartBar({ slug, products }: { slug: string; products: StoreProduct[] }) {
  const cart = useCart();
  if (!cart.ready || cart.count === 0) return null;
  const total = cart.lines.reduce((s, l) => {
    const p = products.find((x) => x.id === l.productId);
    const price = p?.units.find((u) => u.unit === l.unit)?.price ?? 0;
    return s + price * l.qty;
  }, 0);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-bold text-ink">
            {cart.lines.length} item{cart.lines.length === 1 ? '' : 's'} · <span className="font-mono">{fmtInr(total)}</span>
          </div>
          <div className="text-[11.5px] text-ink-faint">Before GST and delivery</div>
        </div>
        <Link href={`/s/${slug}/checkout`} className="flex h-11 items-center gap-2 rounded-md2 bg-brand px-5 text-[14px] font-bold text-white hover:bg-brand-dark">
          <ShoppingBag size={16} /> Checkout
        </Link>
      </div>
    </div>
  );
}
