'use client';

import { formatUnit } from '@/lib/gst';
import { cn } from '@/lib/utils';
import type { UnitProduct } from '@/lib/stock-units';
import { unitOptions } from './stock-meta';

/** Quantity box + unit dropdown from the product's own pricing units
 * (Box, Piece…) — the drawers convert whatever is picked to main units. */
export function QtyUnitInput({
  product,
  qty,
  unit,
  onQtyChange,
  onUnitChange,
  id,
  invalid,
}: {
  product: UnitProduct;
  qty: string;
  unit: string;
  onQtyChange: (qty: string) => void;
  onUnitChange: (unit: string) => void;
  id?: string;
  invalid?: boolean;
}) {
  const units = unitOptions(product);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
      <input
        id={id}
        value={qty}
        inputMode="decimal"
        aria-label="Quantity"
        onChange={(e) => onQtyChange(e.target.value)}
        className={cn(
          'h-9 w-full rounded-sm2 border border-border bg-surface px-3 font-mono text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20',
          invalid && 'border-destructive focus:border-destructive'
        )}
      />
      <select
        value={unit}
        aria-label="Unit"
        disabled={units.length < 2}
        onChange={(e) => onUnitChange(e.target.value)}
        className="h-9 w-full rounded-sm2 border border-border bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-100"
      >
        {units.map((u) => (
          <option key={u} value={u}>
            {formatUnit(u)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Grey "what this will do" line under a quantity — "Adds 24 Box. New
 * stock: 26 Box + 6 Pc." */
export function ConvertNote({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'error' }) {
  return (
    <div className={cn('mt-1.5 rounded-sm2 px-2.5 py-1.5 text-[12px]', tone === 'error' ? 'bg-red-soft font-semibold text-red' : 'bg-surface-alt text-ink-soft')}>
      {children}
    </div>
  );
}
