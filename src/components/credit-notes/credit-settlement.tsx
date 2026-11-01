'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, IndianRupee, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/components/current-user';
import { useApplyCredit, useDeleteRefund, useInvoicesForCredit, useRecordRefund, useRemoveAdjustment } from '@/hooks/use-credit-notes';
import { fmtInr, formatInvoiceDate } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { cn } from '@/lib/utils';

const MODES = ['Cash', 'UPI', 'GPay', 'Bank transfer', 'Cheque'];

export type SettlementNote = {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string | null;
  open: number;
  adjustments: { paymentId: string; invoiceId: string; invoiceNumber: string; amount: number; date: string; own: boolean }[];
  refunds: { id: string; amount: number; date: string; mode: string | null; reference: string | null }[];
};

/** What happened to a credit note's money, and the two ways to settle
 * what's still owed: pay it back (refund) or use it on another of the
 * customer's unpaid invoices (adjust). The owner can undo a refund or an
 * adjustment recorded by mistake. */
export function CreditSettlement({ note }: { note: SettlementNote }) {
  const router = useRouter();
  const { isOwner } = useCurrentUser();
  const [refundOpen, setRefundOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const delRefund = useDeleteRefund();
  const removeAdj = useRemoveAdjustment();

  const history = [
    ...note.adjustments.map((a) => ({ key: a.paymentId, date: a.date, kind: a.own ? ('setoff' as const) : ('adjust' as const), a })),
    ...note.refunds.map((r) => ({ key: r.id, date: r.date, kind: 'refund' as const, r })),
  ].sort((x, y) => x.date.localeCompare(y.date));

  function undo(run: () => Promise<unknown>, done: string) {
    run()
      .then(() => {
        toast.success(done);
        router.refresh();
      })
      .catch((e: any) => toast.error(e?.message ?? 'Could not undo that'));
  }

  return (
    <aside className="space-y-3">
      <section className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
        {note.open > 0.004 ? (
          <>
            <div className="text-[14px] font-extrabold text-ink">
              {fmtInr(note.open)} still owed to {note.customerName}
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Button type="button" className="h-10" onClick={() => setRefundOpen(true)}>
                <IndianRupee size={13} /> Record refund
              </Button>
              <Button type="button" variant="outline" className="h-10 border-brand text-brand-dark" onClick={() => setAdjustOpen(true)}>
                <Repeat size={13} /> Adjust on an invoice
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[13.5px] font-bold text-green">
            <CheckCircle2 size={16} /> Fully settled — nothing owed either way.
          </div>
        )}
      </section>

      <section className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
        <div className="mb-2 text-[13px] font-extrabold text-ink">History</div>
        {history.length === 0 ? (
          <p className="text-[12.5px] text-ink-soft">Kept as {note.customerName}&apos;s credit — not refunded or adjusted yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.key} className="flex items-start gap-2.5 text-[12.5px]">
                <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', h.kind === 'refund' ? 'bg-gold' : h.kind === 'adjust' ? 'bg-brand' : 'bg-ink-faint')} />
                <span className="min-w-0 flex-1 text-ink-body">
                  <b className="text-ink">{formatInvoiceDate(h.date)}</b> ·{' '}
                  {h.kind === 'refund' ? (
                    <>
                      Refunded <b className="font-mono text-ink">{fmtInr(h.r.amount)}</b>
                      {h.r.mode ? ` by ${h.r.mode}` : ''}
                      {h.r.reference ? ` · ${h.r.reference}` : ''}
                    </>
                  ) : (
                    <>
                      <b className="font-mono text-ink">{fmtInr(h.a.amount)}</b> {h.kind === 'setoff' ? 'set off against' : 'adjusted against'}{' '}
                      <Link href={`/invoices/${h.a.invoiceId}`} className="font-mono hover:text-brand hover:underline">
                        {h.a.invoiceNumber}
                      </Link>
                    </>
                  )}
                </span>
                {isOwner && h.kind === 'refund' && (
                  <button type="button" onClick={() => undo(() => delRefund.mutateAsync(h.r.id), 'Refund removed')} className="flex-shrink-0 text-[11.5px] font-bold text-red hover:underline">
                    Remove
                  </button>
                )}
                {isOwner && h.kind === 'adjust' && (
                  <button type="button" onClick={() => undo(() => removeAdj.mutateAsync(h.a.paymentId), 'Adjustment removed')} className="flex-shrink-0 text-[11.5px] font-bold text-red hover:underline">
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RefundDialog note={note} open={refundOpen} onOpenChange={setRefundOpen} onDone={() => router.refresh()} />
      <AdjustDialog note={note} open={adjustOpen} onOpenChange={setAdjustOpen} onDone={() => router.refresh()} />
    </aside>
  );
}

function RefundDialog({ note, open, onOpenChange, onDone }: { note: SettlementNote; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const record = useRecordRefund(note.id);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIst());
  const [mode, setMode] = useState('Cash');
  const [reference, setReference] = useState('');
  const [sendNote, setSendNote] = useState(false);
  const canSend = !!note.customerPhone;

  useEffect(() => {
    if (!open) return;
    setAmount(note.open.toFixed(2));
    setDate(todayIst());
    setMode('Cash');
    setReference('');
    setSendNote(canSend);
  }, [open, note.open, canSend]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return toast.error('Enter the amount refunded');
    // Opened inside the click, before the save — popup blockers stop a
    // window opened afterwards.
    const win = sendNote && canSend ? window.open('', '_blank') : null;
    try {
      await record.mutateAsync({ amount: value, date, mode, reference: reference.trim() || null });
      toast.success(`${fmtInr(value)} refund recorded`);
      if (win) {
        const digits = (note.customerPhone ?? '').replace(/\D/g, '');
        const to = digits.length === 10 ? `91${digits}` : digits;
        const left = Math.max(0, note.open - value);
        const text = `Hello ${note.customerName}, we've refunded ${fmtInr(value)} by ${mode} against credit note ${note.number}.${left > 0.004 ? ` ${fmtInr(left)} is still with us as your credit.` : ''}\n\nThank you!`;
        win.location.href = `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
      }
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      win?.close();
      toast.error(err?.message ?? 'Could not record the refund');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Refund to {note.customerName}</DialogTitle>
        </DialogHeader>
        <form id="refund-form" onSubmit={submit} className="space-y-3">
          <p className="text-[12.5px] text-ink-soft">
            Out of <span className="font-mono">{note.number}</span> · <b className="text-ink">{fmtInr(note.open)} open</b>
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Amount (₹)" name="refund-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} mono />
            <Field label="Date" name="refund-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <span className="mb-1 block text-[11px] font-bold text-ink-faint">Paid back by</span>
            <div className="grid grid-cols-3 gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn('h-9 rounded-sm2 border text-[12px] font-bold', mode === m ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft')}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <Field label={mode === 'Cash' ? 'Note (optional)' : 'Reference (optional)'} name="refund-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          <label className={cn('flex items-center gap-2.5 rounded-lg2 border border-line px-3 py-2 text-[12.5px]', canSend ? 'bg-green-soft text-ink-body' : 'bg-surface-alt text-ink-faint')}>
            <input type="checkbox" checked={sendNote && canSend} disabled={!canSend} onChange={(e) => setSendNote(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--green))]" />
            {canSend ? `Send a refund note to ${note.customerName} on WhatsApp` : 'No phone number on file to send a WhatsApp note'}
          </label>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="refund-form" disabled={record.isPending}>
            {record.isPending ? 'Saving…' : `Record refund · ${fmtInr(Number(amount) || 0)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ note, open, onOpenChange, onDone }: { note: SettlementNote; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { data: invoices = [], isLoading } = useInvoicesForCredit(note.id, open);
  const apply = useApplyCredit(note.id);
  const [picked, setPicked] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const target = invoices.find((i) => i.id === picked) ?? null;

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setAmount('');
  }, [open]);
  useEffect(() => {
    if (!picked && invoices.length) setPicked(invoices[0].id);
  }, [invoices, picked]);
  useEffect(() => {
    if (target) setAmount(Math.min(note.open, target.balanceDue).toFixed(2));
  }, [target, note.open]);

  async function submit() {
    const value = Number(amount);
    if (!target) return toast.error('Pick the invoice to adjust it against');
    if (!(value > 0)) return toast.error('Enter the amount to adjust');
    try {
      await apply.mutateAsync({ invoiceId: target.id, amount: value });
      toast.success(`${fmtInr(value)} adjusted against ${target.number}`);
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not adjust the credit');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Adjust on an unpaid invoice</DialogTitle>
        </DialogHeader>
        <p className="text-[12.5px] text-ink-soft">
          Use {note.customerName}&apos;s <b className="text-ink">{fmtInr(note.open)}</b> credit from <span className="font-mono">{note.number}</span> to pay one of their invoices.
        </p>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : invoices.length === 0 ? (
          <p className="rounded-lg2 bg-surface-alt px-3 py-2.5 text-[12.5px] text-ink-soft">
            {note.customerName} has no unpaid invoices right now. Keep it as credit, or record a refund.
          </p>
        ) : (
          <>
            <div className="max-h-[min(40vh,260px)] space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="Invoice">
              {invoices.map((inv) => (
                <label
                  key={inv.id}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg2 border px-3 py-2', picked === inv.id ? 'border-brand bg-brand-light' : 'border-line')}
                >
                  <input type="radio" name="adjust-invoice" checked={picked === inv.id} onChange={() => setPicked(inv.id)} className="h-4 w-4 accent-[hsl(var(--brand))]" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] font-bold text-ink">{inv.number}</span>
                    <span className="block text-[11.5px] text-ink-soft">
                      {formatInvoiceDate(inv.date)} · {fmtInr(inv.balanceDue)} due
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <Field label="Amount (₹)" name="adjust-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} mono />
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {invoices.length > 0 && (
            <Button type="button" onClick={submit} disabled={apply.isPending || !target}>
              {apply.isPending ? 'Saving…' : `Adjust ${fmtInr(Number(amount) || 0)}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
