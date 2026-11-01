import { cn } from '@/lib/utils';
import { formatStock, stockStatus, type StockStatus, type UnitProduct } from '@/lib/stock-units';

export type StockProduct = UnitProduct & { trackStock: boolean; stockQty: unknown; lowStockAt?: unknown };

const STYLES: Record<StockStatus, string> = {
  in: 'bg-green-soft text-green',
  low: 'bg-gold-soft text-gold',
  out: 'bg-red-soft text-red',
  untracked: 'bg-surface-alt text-ink-faint',
};

/** On-hand stock in the words a person counting a freezer would use
 * ("4 Box + 6 Pc"), coloured by status: green in stock, amber at or below
 * the low-stock alert, red when out, muted "Not tracked" otherwise. */
export function StockBadge({ product, className }: { product: StockProduct; className?: string }) {
  const status = stockStatus(product);
  const label = status === 'untracked' ? 'Not tracked' : formatStock(Number(product.stockQty), product);
  return (
    <span
      className={cn('inline-flex items-center whitespace-nowrap rounded-sm2 px-2 py-0.5 font-mono text-[11px] font-extrabold', status === 'untracked' && 'font-sans font-bold', STYLES[status], className)}
      title={status === 'out' ? 'Out of stock' : status === 'low' ? 'Low stock' : undefined}
    >
      {label}
    </span>
  );
}
