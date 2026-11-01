'use client';

import { useQuery } from '@tanstack/react-query';
import { PackageCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getHeldStock } from '@/actions/invoices';
import { useDeleteInvoice } from '@/hooks/use-invoices';
import { unwrap } from '@/lib/action-result';

/** Delete confirmation for an invoice, shared by the Invoices list and the
 * invoice editor. A draft lists the stock it's holding and offers both
 * ways out — put it back (the goods are still here) or not (they went out
 * anyway). A sent or paid invoice never restocks: its goods left with the
 * customer, and a credit note is how returned goods come back. */
export function DeleteInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onDeleted,
}: {
  invoice: { id: string; number: string; status: string; irn?: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const del = useDeleteInvoice();
  const isDraft = invoice?.status === 'DRAFT';
  const held = useQuery({
    queryKey: ['invoices', 'held-stock', invoice?.id],
    queryFn: async () => unwrap(await getHeldStock(invoice!.id)).lines ?? [],
    enabled: open && !!invoice && isDraft,
    staleTime: 0,
  });
  const lines = held.data ?? [];
  const offersChoice = isDraft && lines.length > 0;

  function remove(restock: boolean) {
    if (!invoice) return;
    del.mutate(
      { invoiceId: invoice.id, restock },
      {
        onSuccess: () => {
          toast.success(`${invoice.number} deleted${offersChoice ? (restock ? ' — stock put back' : ' — stock not put back') : ''}`);
          onOpenChange(false);
          onDeleted?.();
        },
        onError: (e) => {
          onOpenChange(false);
          toast.error(e.message || 'Could not delete the invoice');
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !del.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 pr-6">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 bg-red-soft text-red">
              <Trash2 size={15} />
            </span>
            <span className="min-w-0">Delete {invoice?.number}?</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-[13px] leading-relaxed text-ink-body">
          {!isDraft ? (
            <p>
              This removes the invoice with its items and payments. Its stock is not put back: if the goods never went out, move it back to draft first and then
              delete it; if they came back, raise a credit note instead of deleting.
            </p>
          ) : held.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          ) : offersChoice ? (
            <>
              <p>
                This draft is holding stock for {lines.length} product{lines.length === 1 ? '' : 's'}:
              </p>
              {/* Scrolls inside the dialog, so a long draft keeps the buttons in view. */}
              <ul className="max-h-[min(40vh,260px)] divide-y divide-line overflow-y-auto overscroll-contain rounded-lg2 border border-line">
                {lines.map((l) => (
                  <li key={l.productId} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12.5px]">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{l.name}</span>
                      <span className="block text-[11px] text-ink-faint">{l.inStock} in stock now</span>
                    </span>
                    <b className="flex-shrink-0 font-mono text-ink">{l.qty}</b>
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-ink-soft">
                <b className="text-ink">Restock</b> if the goods are still with you. <b className="text-ink">Delete without restock</b> if they’ve already gone out.
              </p>
            </>
          ) : (
            <p>This removes the draft with its items. It isn’t holding any stock, so nothing changes in Inventory.</p>
          )}
          {invoice?.irn && <p className="text-[12px] text-ink-soft">Its e-Invoice stays filed with the GST portal — cancel it there within 24 hours if needed.</p>}
          <p className="text-[12px] text-ink-faint">This can’t be undone.</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            Cancel
          </Button>
          {offersChoice ? (
            <>
              <Button type="button" variant="outline" className="border-red-soft text-red hover:bg-red-soft hover:text-red" onClick={() => remove(false)} disabled={del.isPending}>
                Delete without restock
              </Button>
              <Button type="button" variant="destructive" onClick={() => remove(true)} disabled={del.isPending}>
                {!del.isPending && <PackageCheck size={13} />}
                {del.isPending ? 'Please wait…' : 'Restock & delete'}
              </Button>
            </>
          ) : (
            <Button type="button" variant="destructive" onClick={() => remove(true)} disabled={del.isPending || (isDraft && held.isLoading)}>
              {del.isPending ? 'Please wait…' : 'Delete invoice'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
