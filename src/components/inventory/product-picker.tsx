'use client';

import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStock } from '@/lib/stock-units';
import type { StockProduct } from '@/actions/inventory';

/** Type-to-search product box with a dropdown — the Stock in drawer's
 * product field and the purchase form's "add a product" box. Filters an
 * already-loaded catalog, so results appear as fast as you type. Calls
 * `onPick` and clears itself; the caller decides what a pick means.
 * `disabledReason` greys a product out with a short explanation (e.g. "Not
 * tracked" in the Stock in drawer). */
export function ProductPicker({
  products,
  onPick,
  placeholder = 'Search products…',
  disabledReason,
  autoFocus,
  className,
  loading,
}: {
  products: StockProduct[];
  onPick: (p: StockProduct) => void;
  placeholder?: string;
  disabledReason?: (p: StockProduct) => string | null;
  autoFocus?: boolean;
  className?: string;
  loading?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = words.length ? products.filter((p) => words.every((w) => `${p.name} ${p.category}`.toLowerCase().includes(w))) : products;
    return list.slice(0, 40);
  }, [products, query]);

  function pick(p: StockProduct) {
    if (disabledReason?.(p)) return;
    onPick(p);
    setQuery('');
    setActive(0);
    setOpen(false);
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          ref={inputRef}
          value={query}
          autoFocus={autoFocus}
          placeholder={loading ? 'Loading products…' : placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delayed so a click on a result lands before the list closes.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (matches[active]) pick(matches[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="flex h-9 w-full rounded-sm2 border border-border bg-surface py-2 pl-8 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-[110] mt-1 max-h-[280px] overflow-y-auto rounded-md2 border border-line bg-popover p-1 shadow-elevated">
          {matches.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-ink-faint">{loading ? 'Loading…' : 'No products match.'}</div>
          ) : (
            matches.map((p, i) => {
              const reason = disabledReason?.(p) ?? null;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={!!reason}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(p)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-sm2 px-2.5 py-2 text-left',
                    i === active && !reason && 'bg-surface-alt',
                    reason ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-ink">{p.name}</span>
                    <span className="block truncate text-[11px] text-ink-faint">{p.category}</span>
                  </span>
                  <span className="flex-shrink-0 text-right text-[11px] text-ink-faint">
                    {reason ?? (p.trackStock ? formatStock(p.stockQty, p) : 'Not tracked')}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
