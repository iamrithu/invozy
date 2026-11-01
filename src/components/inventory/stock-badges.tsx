import type { StockMovementType } from '@prisma/client';
import type { StockStatus } from '@/lib/stock-units';
import { cn } from '@/lib/utils';
import { MOVEMENT_META, SALE_REDUCED_META, STATUS_META } from './stock-meta';

export function SoftBadge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-sm2 px-2 py-0.5 text-[11px] font-extrabold', className)}>{children}</span>;
}

export function StockStatusBadge({ status, className }: { status: StockStatus; className?: string }) {
  const meta = STATUS_META[status];
  return <SoftBadge className={cn(meta.className, className)}>{meta.label}</SoftBadge>;
}

/** `reversal` — see isInvoiceReversal. */
export function MovementBadge({ type, reversal }: { type: StockMovementType; reversal?: boolean }) {
  const meta = reversal ? SALE_REDUCED_META : MOVEMENT_META[type];
  return <SoftBadge className={meta.className}>{meta.label}</SoftBadge>;
}
