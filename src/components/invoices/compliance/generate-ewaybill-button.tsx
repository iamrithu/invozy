'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, CheckCircle2, Check, Ban, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { generateEwaybillAction, cancelEwaybillAction } from '@/actions/gst-compliance';
import { CancelReasonDialog } from './cancel-reason-dialog';

const TRANSPORT_MODES = [
  { value: 'ROAD', label: 'Road' },
  { value: 'RAIL', label: 'Rail' },
  { value: 'AIR', label: 'Air' },
  { value: 'SHIP', label: 'Ship' },
];

const CANCEL_REASONS = [
  { value: '1', label: 'Duplicate' },
  { value: '2', label: 'Order cancelled' },
  { value: '3', label: 'Data entry mistake' },
  { value: '4', label: 'Others' },
];

type Defaults = {
  vehicleNo: string | null;
  transporterId: string | null;
  transporterName: string | null;
  transporterDocNo: string | null;
  transporterDocDate: string | null;
  transportMode: string;
  distanceKm: number | null;
};

export function GenerateEwaybillButton({
  invoiceId,
  hasCredentials,
  status,
  defaults,
}: {
  invoiceId: string;
  hasCredentials: boolean;
  status: 'NOT_GENERATED' | 'GENERATED' | 'CANCELLED' | 'FAILED';
  defaults: Defaults;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  if (status === 'GENERATED') {
    return (
      <>
        <span className="flex items-center gap-1.5 rounded-sm2 bg-green-soft px-3 py-1.5 text-[11.5px] font-bold text-green">
          <CheckCircle2 size={13} /> e-Way Bill generated
        </span>
        <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)} className="text-destructive hover:bg-destructive/10">
          <Ban size={13} /> Cancel
        </Button>
        <CancelReasonDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          title="Cancel e-Way Bill"
          reasonOptions={CANCEL_REASONS}
          onConfirm={(reasonCode, remark) => cancelEwaybillAction(invoiceId, { reasonCode: reasonCode as any, remark })}
          onCancelled={() => {
            toast.success('e-Way Bill cancelled');
            // See generate-einvoice-button.tsx — keeps this refresh out of
            // the route's loading.tsx fallback so only the button shows a
            // loading state, never the whole page.
            startTransition(() => router.refresh());
          }}
        />
      </>
    );
  }

  if (status === 'CANCELLED') {
    return (
      <span className="flex items-center gap-1.5 rounded-sm2 bg-surface-alt px-3 py-1.5 text-[11.5px] font-bold text-ink-faint">
        <XCircle size={13} /> e-Way Bill cancelled
      </span>
    );
  }

  function handleOpen() {
    if (!hasCredentials) {
      toast.error('Add NIC API credentials in Company settings (e-Invoice / e-Way Bill tab) first.');
      return;
    }
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(undefined);
    startTransition(async () => {
      const result = await generateEwaybillAction(invoiceId, {
        vehicleNo: String(formData.get('vehicleNo') || ''),
        transporterId: String(formData.get('transporterId') || ''),
        transporterName: String(formData.get('transporterName') || ''),
        transporterDocNo: String(formData.get('transporterDocNo') || ''),
        transporterDocDate: String(formData.get('transporterDocDate') || '') || null,
        transportMode: String(formData.get('transportMode') || 'ROAD') as 'ROAD' | 'RAIL' | 'AIR' | 'SHIP',
        distanceKm: Number(formData.get('distanceKm') || 0),
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('e-Way Bill generated');
      setOpen(false);
      startTransition(() => router.refresh());
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen} title={hasCredentials ? undefined : 'Add NIC API credentials in Company settings first'}>
        <Truck size={13} /> {status === 'FAILED' ? 'Retry e-Way Bill' : 'Generate e-Way Bill'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <form onSubmit={handleSubmit} className="contents">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck size={16} className="text-brand" /> Transport details
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 px-6">
              <div className="col-span-2">
                <Field label="Vehicle number" name="vehicleNo" defaultValue={defaults.vehicleNo ?? ''} mono />
              </div>
              <Field as="select" label="Transport mode" name="transportMode" defaultValue={defaults.transportMode} options={TRANSPORT_MODES} />
              <Field label="Approx. distance (km)" name="distanceKm" type="number" mono defaultValue={defaults.distanceKm?.toString() ?? ''} />
              <Field label="Transporter ID (optional)" name="transporterId" defaultValue={defaults.transporterId ?? ''} mono />
              <Field label="Transporter name (optional)" name="transporterName" defaultValue={defaults.transporterName ?? ''} />
              <Field label="Transport doc no. (optional)" name="transporterDocNo" defaultValue={defaults.transporterDocNo ?? ''} mono />
              <Field label="Transport doc date (optional)" name="transporterDocDate" type="date" defaultValue={defaults.transporterDocDate ?? ''} />
            </div>
            {error && <p className="px-6 text-[12.5px] font-bold text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                <Check size={13} /> {pending ? 'Generating…' : 'Generate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
