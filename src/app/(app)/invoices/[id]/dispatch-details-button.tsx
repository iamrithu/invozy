'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { updateDispatchDetails } from '@/actions/invoices';

type Defaults = {
  deliveryNote: string | null;
  deliveryNoteDate: string | null;
  buyersOrderNo: string | null;
  buyersOrderDate: string | null;
  dispatchDocNo: string | null;
  otherReferences: string | null;
  billOfLadingNo: string | null;
  destination: string | null;
};

/** The standard Tally-style reference fields (Delivery Note, Buyer's Order
 * No, Dispatch Doc No, Bill of Lading/LR-RR No, Other References,
 * Destination) shown on the CLASSIC template's header grid — print/reference
 * only, independent of the e-Way Bill transport-details dialog (a business
 * fills these in at dispatch time whether or not an e-Way Bill ever gets
 * generated via NIC). */
export function DispatchDetailsButton({ invoiceId, defaults }: { invoiceId: string; defaults: Defaults }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(undefined);
    startTransition(async () => {
      const result = await updateDispatchDetails(invoiceId, {
        deliveryNote: String(formData.get('deliveryNote') || '') || null,
        deliveryNoteDate: String(formData.get('deliveryNoteDate') || '') || null,
        buyersOrderNo: String(formData.get('buyersOrderNo') || '') || null,
        buyersOrderDate: String(formData.get('buyersOrderDate') || '') || null,
        dispatchDocNo: String(formData.get('dispatchDocNo') || '') || null,
        otherReferences: String(formData.get('otherReferences') || '') || null,
        billOfLadingNo: String(formData.get('billOfLadingNo') || '') || null,
        destination: String(formData.get('destination') || '') || null,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Dispatch details saved');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ClipboardList size={13} /> Dispatch details
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[460px]">
          <form onSubmit={handleSubmit} className="contents">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList size={16} className="text-brand" /> Dispatch / reference details
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 px-6">
              <Field label="Delivery note" name="deliveryNote" defaultValue={defaults.deliveryNote ?? ''} />
              <Field label="Delivery note date" name="deliveryNoteDate" type="date" defaultValue={defaults.deliveryNoteDate ?? ''} />
              <Field label="Buyer's order no." name="buyersOrderNo" defaultValue={defaults.buyersOrderNo ?? ''} />
              <Field label="Buyer's order date" name="buyersOrderDate" type="date" defaultValue={defaults.buyersOrderDate ?? ''} />
              <Field label="Dispatch doc no." name="dispatchDocNo" defaultValue={defaults.dispatchDocNo ?? ''} />
              <Field label="Bill of Lading / LR-RR no." name="billOfLadingNo" defaultValue={defaults.billOfLadingNo ?? ''} />
              <Field label="Destination" name="destination" defaultValue={defaults.destination ?? ''} />
              <div className="col-span-2">
                <Field label="Other references" name="otherReferences" defaultValue={defaults.otherReferences ?? ''} />
              </div>
            </div>
            {error && <p className="px-6 text-[12.5px] font-bold text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                <Check size={13} /> {pending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
