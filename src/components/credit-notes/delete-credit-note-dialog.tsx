'use client';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fmtInr } from '@/lib/gst';

/** Confirms a credit-note delete, spelling out what it undoes — the same
 * wording on the list and on the credit note's own page. */
export function DeleteCreditNoteDialog({
  open,
  onOpenChange,
  number,
  invoiceNumber,
  applied = 0,
  restock,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  number?: string;
  invoiceNumber?: string | null;
  /** What the note set off against its invoice. */
  applied?: number;
  restock?: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete credit note"
      description={
        <>
          Delete <b className="font-mono font-bold text-ink">{number}</b>?{' '}
          {invoiceNumber && applied > 0.004 && (
            <>
              The <b className="font-mono font-bold text-ink">{fmtInr(applied)}</b> it set off against <b className="font-mono font-bold text-ink">{invoiceNumber}</b> is removed, so
              that much is due on the invoice again.{' '}
            </>
          )}
          {restock && 'The goods it put back are taken out of stock again. '}
          This can&apos;t be undone.
        </>
      }
      confirmLabel="Delete credit note"
      pending={pending}
      onConfirm={onConfirm}
    />
  );
}
