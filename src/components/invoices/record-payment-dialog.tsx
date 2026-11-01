'use client';

import { useEffect, useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useRecordPayment } from '@/hooks/use-invoices';
import { todayIst } from '@/lib/dates';
import { fmtInr } from '@/lib/gst';

const MODES = ['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Card'];

/** Shared by the invoice list and the invoice editor. Defaults to the full
 * balance and today's (India) date, but both can be changed — the old
 * inline form always recorded "today" with no way to say how it was paid. */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  balanceDue,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  balanceDue: number;
  onRecorded?: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIst());
  const [mode, setMode] = useState('Cash');
  const [reference, setReference] = useState('');
  const record = useRecordPayment(invoiceId);

  useEffect(() => {
    if (!open) return;
    setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
    setDate(todayIst());
    setMode('Cash');
    setReference('');
  }, [open, balanceDue]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) {
      toast.error('Enter an amount greater than zero');
      return;
    }
    try {
      const res = await record.mutateAsync({ amount: value, date, mode, reference: reference.trim() || null });
      toast.success(`${fmtInr(value)} recorded on ${invoiceNumber}${res.receiptNo ? ` · receipt ${res.receiptNo}` : ''}`);
      onOpenChange(false);
      onRecorded?.();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not record the payment');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee size={16} className="text-brand" /> Record payment · {invoiceNumber}
          </DialogTitle>
        </DialogHeader>
        <form id="record-payment-form" onSubmit={submit} className="space-y-3">
          <p className="text-[12.5px] text-ink-soft">
            Balance due <b className="font-mono text-ink">{fmtInr(balanceDue)}</b>
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Amount (₹)" name="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} mono />
            <Field label="Date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Field label="Paid by" name="mode" as="select" value={mode} onChange={(e) => setMode(e.target.value)} options={MODES.map((m) => ({ value: m, label: m }))} />
          <Field
            label={mode === 'Cheque' ? 'Cheque number (optional)' : mode === 'Cash' ? 'Note (optional)' : 'Transaction reference (optional)'}
            name="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="record-payment-form" disabled={record.isPending}>
            {record.isPending ? 'Saving…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
