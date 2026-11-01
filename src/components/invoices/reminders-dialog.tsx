'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listOverdueForReminders, type OverdueReminder } from '@/actions/invoices';
import { useWhatsAppShare } from '@/hooks/use-invoices';
import { fmtInr } from '@/lib/gst';
import { todayIst } from '@/lib/dates';

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86_400_000);
}

function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** Every overdue invoice in one list, oldest first, each with its own
 * WhatsApp reminder. WhatsApp can't send in bulk from a link, so each tap
 * opens one chat with the message ready — send it, come back, tap the next;
 * rows already done this time are ticked. */
export function RemindersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['invoices', 'overdue-reminders'], queryFn: () => listOverdueForReminders(), enabled: open });
  const whatsApp = useWhatsAppShare();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const today = todayIst();
  const totalDue = data.reduce((s, r) => s + r.balance, 0);

  function remind(r: OverdueReminder) {
    const win = window.open('', '_blank');
    whatsApp.mutate(
      {
        invoiceId: r.id,
        phone: r.phone,
        win,
        reminder: true,
        buildMessage: (url) => `Hello ${r.customer}, a gentle reminder: invoice ${r.number} has ${fmtInr(r.balance)} due (due ${fmtDay(r.due)}).\n\nView invoice: ${url}\n\nThank you!`,
      },
      {
        onSuccess: () => setSent((prev) => new Set(prev).add(r.id)),
        onError: (e: any) => toast.error(e?.message ?? 'Could not create the reminder link'),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle size={16} className="text-brand" /> Payment reminders
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-[13px] text-ink-soft">Nothing is overdue — every sent invoice is within its due date.</p>
        ) : (
          <>
            <p className="text-[12.5px] text-ink-soft">
              {data.length} overdue · <b className="font-mono text-ink">{fmtInr(totalDue)}</b> to collect. Each Send opens WhatsApp with the message ready.
            </p>
            <ul className="max-h-[min(55vh,420px)] divide-y divide-line overflow-y-auto overscroll-contain rounded-lg2 border border-line">
              {data.map((r) => {
                const late = daysBetween(r.due, today);
                const done = sent.has(r.id);
                return (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-ink">{r.customer}</div>
                      <div className="text-[11.5px] text-ink-soft">
                        <span className="font-mono">{r.number}</span> · <b className="font-mono text-ink">{fmtInr(r.balance)}</b> ·{' '}
                        <span className="text-red">{late} day{late === 1 ? '' : 's'} late</span>
                        {r.lastRemindedAt && !done && <> · reminded {fmtDay(r.lastRemindedAt.slice(0, 10))}</>}
                      </div>
                    </div>
                    {done ? (
                      <span className="flex flex-shrink-0 items-center gap-1 text-[12px] font-bold text-green">
                        <Check size={13} /> Sent
                      </span>
                    ) : (
                      <Button type="button" size="sm" className="flex-shrink-0" onClick={() => remind(r)} disabled={!r.phone} title={r.phone ? undefined : 'No phone number on file'}>
                        {r.phone ? 'Send' : 'No phone'}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
