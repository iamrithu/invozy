'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileSignature, CheckCircle2, Ban, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { generateEinvoice, cancelEinvoiceAction } from '@/actions/gst-compliance';
import { CancelReasonDialog } from './cancel-reason-dialog';

const REASONS = [
  { value: '1', label: 'Duplicate' },
  { value: '2', label: 'Data entry mistake' },
  { value: '3', label: 'Order cancelled' },
  { value: '4', label: 'Others' },
];

export function GenerateEinvoiceButton({ invoiceId, hasCredentials, status }: { invoiceId: string; hasCredentials: boolean; status: 'NOT_GENERATED' | 'GENERATED' | 'CANCELLED' | 'FAILED' }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  if (status === 'GENERATED') {
    return (
      <>
        <span className="flex items-center gap-1.5 rounded-sm2 bg-green-soft px-3 py-1.5 text-[11.5px] font-bold text-green">
          <CheckCircle2 size={13} /> e-Invoice generated
        </span>
        <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)} className="text-destructive hover:bg-destructive/10">
          <Ban size={13} /> Cancel
        </Button>
        <CancelReasonDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          title="Cancel e-Invoice"
          reasonOptions={REASONS}
          onConfirm={(reasonCode, remark) => cancelEinvoiceAction(invoiceId, { reasonCode: reasonCode as any, remark })}
          onCancelled={() => {
            toast.success('e-Invoice cancelled');
            // Wrapped in its own transition so this refresh (fetching the
            // now-cancelled status from the server) never trips the route's
            // loading.tsx fallback — the button's own pending state is the
            // only loading indicator the user should see.
            startTransition(() => router.refresh());
          }}
        />
      </>
    );
  }

  if (status === 'CANCELLED') {
    return (
      <span className="flex items-center gap-1.5 rounded-sm2 bg-surface-alt px-3 py-1.5 text-[11.5px] font-bold text-ink-faint">
        <XCircle size={13} /> e-Invoice cancelled
      </span>
    );
  }

  function handleClick() {
    if (!hasCredentials) {
      toast.error('Add NIC API credentials in Company settings (e-Invoice / e-Way Bill tab) first.');
      return;
    }
    startTransition(async () => {
      const result = await generateEinvoice(invoiceId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('e-Invoice generated');
      startTransition(() => router.refresh());
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={pending} title={hasCredentials ? undefined : 'Add NIC API credentials in Company settings first'}>
      <FileSignature size={13} /> {pending ? 'Generating…' : status === 'FAILED' ? 'Retry e-Invoice' : 'Generate e-Invoice'}
    </Button>
  );
}
