'use client';

import { formatUnit } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { formatStock, isPieceUnit, mainPieces, piecesText, round6, stockUnits, unitFactor, type UnitProduct } from '@/lib/stock-units';

export type MixedQty = Record<string, string>;

const key = (unit: string) => unit.trim().toLowerCase();

function num(s: string | undefined): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A mixed count in the product's main unit — 10 Box + 5 Bag + 30 pieces. */
export function mixedTotal(product: UnitProduct, values: MixedQty): number {
  return round6(stockUnits(product).reduce((sum, u) => sum + num(values[key(u)]) * unitFactor(product, u), 0));
}

/** Count stock in whatever units it's actually in — "10 Box + 5 Bag + 30
 * loose pieces" — one box per unit the product has (plus loose pieces when
 * its units say how many pieces they hold), totalled in its main unit. For
 * an opening count, where what's in the freezer is rarely all one unit. */
export function MixedQtyInput({
  product,
  values,
  onChange,
  idPrefix,
  invalid,
}: {
  product: UnitProduct;
  values: MixedQty;
  onChange: (values: MixedQty) => void;
  idPrefix: string;
  invalid?: boolean;
}) {
  const units = stockUnits(product);
  const total = mixedTotal(product, values);
  const pieces = mainPieces(product);
  const anyEntered = units.some((u) => num(values[key(u)]) > 0);

  return (
    <div>
      <div className={cn('grid gap-2', units.length > 1 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1')}>
        {units.map((u) => {
          const each = Math.round(unitFactor(product, u) * pieces * 100) / 100;
          return (
            <label key={key(u)} htmlFor={`${idPrefix}-${key(u)}`} className="block min-w-0">
              <span className="mb-0.5 block truncate text-[11px] font-bold text-ink-soft">
                {isPieceUnit(u) ? 'Loose pieces' : formatUnit(u)}
                {pieces > 1 && !isPieceUnit(u) && <span className="font-normal text-ink-faint"> · {each} pcs</span>}
              </span>
              <input
                id={`${idPrefix}-${key(u)}`}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0"
                value={values[key(u)] ?? ''}
                onChange={(e) => onChange({ ...values, [key(u)]: e.target.value })}
                className={cn(
                  'w-full rounded-sm2 border bg-surface px-2.5 py-2 text-right font-mono text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20',
                  invalid ? 'border-destructive' : 'border-line'
                )}
              />
            </label>
          );
        })}
      </div>
      {anyEntered && units.length > 1 && (
        <p className="mt-1.5 rounded-sm2 bg-surface px-2.5 py-1.5 text-[12px] text-ink-soft">
          Total <b className="text-ink">{formatStock(total, product)}</b>
          {piecesText(total, product) && <> · {piecesText(total, product)}</>}
        </p>
      )}
    </div>
  );
}
