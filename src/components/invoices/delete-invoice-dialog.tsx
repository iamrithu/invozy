'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getHeldStock } from '@/actions/invoices';
import { useDeleteInvoice } from '@/hooks/use-invoices';
import { unwrap } from '@/lib/action-result';
import { useModules } from '@/components/modules/modules-provider';

/** Delete confirmation for an invoice, shared by the Invoices list and the
 * invoice editor. A draft lists the stock it's holding and offers both
 * ways out — put it back (the goods are still here) or not (they went out
 * anyway). A sent or paid invoice never restocks: its goods left with the
 * customer, so the dialog leads with returning them on a credit note —
 * which keeps the invoice on record for GST — and offers the delete after. */
export function DeleteInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onDeleted,
}: {
  invoice: { id: string; number: string; status: string; irn?: string | null; customer?: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const del = useDeleteInvoice();
  const isDraft = invoice?.status === 'DRAFT';
  // Inventory off (src/lib/modules.ts): no stock talk at all — a draft just
  // deletes (its stock quietly goes back, keeping the ledger in step for if
  // the module comes back). Returns off: no "return it on a credit note".
  const modules = useModules();
  const inventoryOn = modules.enabled('inventory');
  const returnsOn = modules.enabled('returns');
  const held = useQuery({
    queryKey: ['invoices', 'held-stock', invoice?.id],
    queryFn: async () => unwrap(await getHeldStock(invoice!.id)).lines ?? [],
    enabled: open && !!invoice && inventoryOn,
    staleTime: 0,
  });
  const lines = inventoryOn ? (held.data ?? []) : [];
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
            <>
              <p>
                It was sent{invoice?.customer ? ` to ${invoice.customer}` : ''}, so deleting it removes it with its payments and puts <b className="text-ink">no</b> stock
                back.
              </p>
              {lines.length > 0 && returnsOn && (
                <div className="space-y-2 rounded-lg2 border border-line bg-green-soft p-3">
                  <div className="text-[13px] font-extrabold text-ink">Goods came back? Return them instead</div>
                  <ul className="max-h-[min(30vh,180px)] divide-y divide-line overflow-y-auto rounded-sm2 border border-line bg-surface">
                    {lines.map((l) => (
                      <li key={l.productId} className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-[12.5px]">
                        <span className="min-w-0 truncate">{l.name}</span>
                        <b className="flex-shrink-0 font-mono text-green">+{l.qty}</b>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[12px] text-ink-soft">
                    A credit note puts all or part of it back in stock and credits the amount. The invoice stays on record for GST.
                  </p>
                  <Button
                    type="button"
                    className="w-full bg-green text-white hover:opacity-90"
                    onClick={() => {
                      onOpenChange(false);
                      router.push(`/credit-notes/new?invoice=${invoice!.id}`);
                    }}
                  >
                    <RotateCcw size={13} /> Return goods with a credit note
                  </Button>
                </div>
              )}
            </>
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
            <p>{inventoryOn ? 'This removes the draft with its items. It isn’t holding any stock, so nothing changes in Inventory.' : 'This removes the draft with its items.'}</p>
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
          ) : !isDraft && lines.length > 0 ? (
            <Button type="button" variant="outline" className="border-red-soft text-red hover:bg-red-soft hover:text-red" onClick={() => remove(false)} disabled={del.isPending}>
              {del.isPending ? 'Please wait…' : 'Delete anyway — stock stays out'}
            </Button>
          ) : (
            <Button type="button" variant="destructive" onClick={() => remove(true)} disabled={del.isPending || held.isLoading}>
              {del.isPending ? 'Please wait…' : 'Delete invoice'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
