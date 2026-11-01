'use client';

import { useEffect, useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useRecordPayment, useWhatsAppShare } from '@/hooks/use-invoices';
import { todayIst } from '@/lib/dates';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

const MODES = ['Cash', 'UPI', 'GPay', 'Bank transfer', 'Cheque', 'Card'];

/** Shared by the invoice list and the invoice editor. Defaults to the full
 * balance and today's (India) date, but both can be changed — the old
 * inline form always recorded "today" with no way to say how it was paid.
 * With the customer's phone on file it can also open WhatsApp with the
 * receipt, in the same tap. */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  balanceDue,
  customer,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  balanceDue: number;
  customer?: { name: string; phone: string | null } | null;
  onRecorded?: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIst());
  const [mode, setMode] = useState('Cash');
  const [reference, setReference] = useState('');
  const [sendReceipt, setSendReceipt] = useState(false);
  const record = useRecordPayment(invoiceId);
  const whatsApp = useWhatsAppShare();
  const canSend = !!customer?.phone;

  useEffect(() => {
    if (!open) return;
    setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
    setDate(todayIst());
    setMode('Cash');
    setReference('');
    setSendReceipt(!!customer?.phone);
  }, [open, balanceDue, customer?.phone]);

  // Round amounts below the balance, for a part payment in one tap.
  const quick = [balanceDue, ...[500, 1000, 2000, 5000].filter((n) => n < balanceDue - 0.004)].slice(0, 4);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) {
      toast.error('Enter an amount greater than zero');
      return;
    }
    // Opened now, inside the click — a window opened after the save would
    // be stopped by the browser's popup blocker.
    const win = sendReceipt && canSend ? window.open('', '_blank') : null;
    try {
      const res = await record.mutateAsync({ amount: value, date, mode, reference: reference.trim() || null });
      toast.success(`${fmtInr(value)} recorded on ${invoiceNumber}${res.receiptNo ? ` · receipt ${res.receiptNo}` : ''}`);
      if (win && customer) {
        const left = Math.max(balanceDue - value, 0);
        whatsApp.mutate(
          {
            invoiceId,
            phone: customer.phone,
            win,
            buildMessage: (url) =>
              `Hello ${customer.name}, we've received ${fmtInr(value)} by ${mode} for invoice ${invoiceNumber}${res.receiptNo ? ` (receipt ${res.receiptNo})` : ''}.${
                left > 0.004 ? ` Balance due: ${fmtInr(left)}.` : ' The invoice is now fully paid.'
              }\n\nInvoice: ${url}\n\nThank you!`,
          },
          { onError: (err: any) => toast.error(err?.message ?? 'Could not open WhatsApp for the receipt') }
        );
      }
      onOpenChange(false);
      onRecorded?.();
    } catch (err: any) {
      win?.close();
      toast.error(err?.message ?? 'Could not record the payment');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee size={16} className="text-brand" /> Record payment · {invoiceNumber}
          </DialogTitle>
        </DialogHeader>
        <form id="record-payment-form" onSubmit={submit} className="space-y-3">
          <p className="text-[12.5px] text-ink-soft">
            {customer?.name ? `${customer.name} · ` : ''}Balance due <b className="font-mono text-ink">{fmtInr(balanceDue)}</b>
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Amount (₹)" name="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} mono />
            <Field label="Date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {balanceDue > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Quick amounts">
              {quick.map((q, i) => {
                const on = Math.abs(parseFloat(amount) - q) < 0.005;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(q.toFixed(2))}
                    className={cn(
                      'h-7 rounded-full border px-2.5 text-[11.5px] font-bold transition-colors',
                      on ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft hover:border-brand/50'
                    )}
                  >
                    {i === 0 ? 'Full due' : fmtInr(q).replace(/\.00$/, '')}
                  </button>
                );
              })}
            </div>
          )}
          <div>
            <span className="mb-1 block text-[11px] font-bold text-ink-faint">Paid by</span>
            <div className="grid grid-cols-3 gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'h-9 rounded-sm2 border text-[12px] font-bold transition-colors',
                    mode === m ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft hover:border-brand/50'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <Field
            label={mode === 'Cheque' ? 'Cheque number (optional)' : mode === 'Cash' ? 'Note (optional)' : 'Transaction reference (optional)'}
            name="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          {customer && (
            <label className={cn('flex items-center gap-2.5 rounded-lg2 border px-3 py-2 text-[12.5px]', canSend ? 'border-line bg-green-soft text-ink-body' : 'border-line bg-surface-alt text-ink-faint')}>
              <input type="checkbox" checked={sendReceipt && canSend} disabled={!canSend} onChange={(e) => setSendReceipt(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--green))]" />
              {canSend ? `Send the receipt to ${customer.name} on WhatsApp` : `No phone number on file for ${customer.name} — add one to send receipts`}
            </label>
          )}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="record-payment-form" disabled={record.isPending}>
            {record.isPending ? 'Saving…' : sendReceipt && canSend ? 'Record & send receipt' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
