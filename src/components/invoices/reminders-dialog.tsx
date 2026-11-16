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
 * rows already done this time are ticked. "Remind all" walks the same list
 * for you: one tap per reminder (a browser only opens WhatsApp from a
 * click), always the next one not yet sent, with progress. */
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
          <p className="text-[13px] text-ink-soft">No sent invoice is overdue. Overdue drafts aren't reminded — send them first.</p>
        ) : (
          <>
            <p className="text-[12.5px] text-ink-soft">
              {data.length} overdue · <b className="font-mono text-ink">{fmtInr(totalDue)}</b> to collect. Each Send opens WhatsApp with the message ready.
            </p>
            <RemindAllBar rows={data} sent={sent} pending={whatsApp.isPending} onRemind={remind} />
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

/** "Remind all": the next unsent reminder (with a phone) one tap away, and
 * how far through the list you are. */
function RemindAllBar({ rows, sent, pending, onRemind }: { rows: OverdueReminder[]; sent: Set<string>; pending: boolean; onRemind: (r: OverdueReminder) => void }) {
  const reachable = rows.filter((r) => r.phone);
  const done = reachable.filter((r) => sent.has(r.id)).length;
  const next = reachable.find((r) => !sent.has(r.id));
  const noPhone = rows.length - reachable.length;
  if (!reachable.length) return null;
  return (
    <div className="rounded-lg2 border border-line bg-bg p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold text-ink">{next ? `Remind all · ${done} of ${reachable.length} sent` : `All ${reachable.length} reminders sent`}</div>
          <div className="truncate text-[11.5px] text-ink-soft">
            {next ? `Next: ${next.customer} · ${next.number}` : 'Nice — everyone overdue has been reminded.'}
            {noPhone > 0 && ` · ${noPhone} without a phone number`}
          </div>
        </div>
        {next && (
          <Button type="button" size="sm" onClick={() => onRemind(next)} disabled={pending}>
            <MessageCircle size={13} /> {done === 0 ? 'Start' : 'Send next'}
          </Button>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt" role="progressbar" aria-valuemin={0} aria-valuemax={reachable.length} aria-valuenow={done}>
        <div className="h-full rounded-full bg-green transition-[width]" style={{ width: `${(done / reachable.length) * 100}%` }} />
      </div>
    </div>
  );
}
