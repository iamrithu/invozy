'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useWhatsAppShare } from '@/hooks/use-invoices';
import { fmtInr } from '@/lib/gst';
import type { DueSoon } from '@/actions/dashboard';

function dueText(daysLeft: number) {
  if (daysLeft <= 0) return 'Due today';
  if (daysLeft === 1) return 'Due tomorrow';
  return `Due in ${daysLeft} days`;
}

/** Invoices falling due in the next 7 days — a friendly nudge now beats a
 * reminder after the date has passed. */
export function DueSoonCard({ data, currency }: { data: { items: DueSoon[]; count: number; total: number }; currency: string }) {
  const whatsApp = useWhatsAppShare();
  const [nudged, setNudged] = useState<Set<string>>(new Set());

  function nudge(d: DueSoon) {
    const win = window.open('', '_blank');
    whatsApp.mutate(
      {
        invoiceId: d.id,
        phone: d.phone,
        win,
        buildMessage: (url) =>
          `Hello ${d.customer}, a friendly note: invoice ${d.number} (${fmtInr(d.balance)}) is due on ${new Date(`${d.due}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.\n\nView invoice: ${url}\n\nThank you!`,
      },
      {
        onSuccess: () => setNudged((prev) => new Set(prev).add(d.id)),
        onError: (e: any) => toast.error(e?.message ?? 'Could not create the link'),
      }
    );
  }

  return (
    <section className="flex min-w-0 flex-col rounded-xl2 border border-line bg-surface shadow-card">
      <header className="flex items-baseline gap-2 px-4 pb-2 pt-3.5">
        <h2 className="text-[13.5px] font-extrabold text-ink">Due this week</h2>
        {data.count > 0 && (
          <span className="truncate text-[11.5px] text-ink-faint">
            {data.count} invoice{data.count === 1 ? '' : 's'} · {fmtInr(data.total, currency)}
          </span>
        )}
      </header>
      {data.items.length === 0 ? (
        <div className="flex items-center gap-2 px-4 pb-5 pt-1 text-[12.5px] text-ink-soft">
          <CalendarClock size={15} className="text-ink-faint" /> Nothing falls due in the next 7 days.
        </div>
      ) : (
        <ul className="divide-y divide-line pb-1">
          {data.items.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2">
              <Link href={`/invoices/${d.id}`} className="min-w-0 flex-1 hover:text-brand">
                <div className="truncate text-[12.5px] font-bold text-ink">{d.customer}</div>
                <div className="truncate text-[11px] text-ink-faint">
                  <span className="font-mono">{d.number}</span> · <span className={d.daysLeft <= 1 ? 'font-semibold text-gold' : ''}>{dueText(d.daysLeft)}</span>
                </div>
              </Link>
              <span className="flex-shrink-0 font-mono text-[12px] font-bold text-ink">{fmtInr(d.balance, currency)}</span>
              {nudged.has(d.id) ? (
                <span className="flex flex-shrink-0 items-center gap-1 text-[10.5px] font-bold text-green">
                  <Check size={12} /> Sent
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => nudge(d)}
                  disabled={!d.phone || whatsApp.isPending}
                  title={d.phone ? 'Send a friendly reminder on WhatsApp' : 'No phone number on file'}
                  aria-label={`Remind ${d.customer} on WhatsApp`}
                  className="flex flex-shrink-0 items-center gap-1 rounded-sm2 border border-line px-2 py-1 text-[10.5px] font-bold text-ink-soft transition-colors hover:border-green hover:text-green disabled:opacity-40"
                >
                  <MessageCircle size={11} /> Nudge
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
