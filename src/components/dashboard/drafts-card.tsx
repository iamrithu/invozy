'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DeleteInvoiceDialog } from '@/components/invoices/delete-invoice-dialog';
import { useSendDraft } from '@/hooks/use-invoices';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';
import type { DraftHoldingStock, DraftsHoldingStock } from '@/actions/inventory';

function ageLabel(days: number) {
  return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
}

/** Drafts holding stock, oldest first, each with the three ways to clear
 * it: send it, open it, or delete it (which asks about restocking). Stock
 * a forgotten draft holds is off the shelf for everyone else. */
export function DraftsCard({ data, currency }: { data: DraftsHoldingStock; currency: string }) {
  const router = useRouter();
  const send = useSendDraft();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DraftHoldingStock | null>(null);

  function sendNow(d: DraftHoldingStock) {
    setSendingId(d.id);
    send.mutate(d.id, {
      onSuccess: () => {
        toast.success(`${d.number} sent`);
        router.refresh();
      },
      onError: (e) => toast.error(e.message || 'Could not send the draft'),
      onSettled: () => setSendingId(null),
    });
  }

  return (
    <div className="rounded-xl2 border border-gold bg-surface shadow-card">
      <div className="flex items-start gap-3 rounded-t-xl2 bg-gold-soft px-3.5 py-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 bg-gold text-white">
          <Clock size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-extrabold text-ink">
            {data.count} draft{data.count === 1 ? ' is' : 's are'} holding stock
          </div>
          <div className="mt-0.5 text-[12px] text-ink-soft">That stock is off the shelf until you send or delete them.</div>
        </div>
        {data.count > data.drafts.length && (
          <Link href="/invoices?status=DRAFT" className="flex flex-shrink-0 items-center gap-1 text-[12px] font-bold text-brand hover:underline">
            All drafts <ArrowRight size={12} />
          </Link>
        )}
      </div>
      <ul className="divide-y divide-line">
        {data.drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-ink">{d.customer}</div>
              <div className="text-[11.5px] text-ink-soft">
                <span className="font-mono">{d.number}</span> · {d.items} item{d.items === 1 ? '' : 's'} · <span className="font-mono">{fmtInr(d.total, currency)}</span>
              </div>
            </div>
            <span
              className={cn(
                'flex-shrink-0 rounded-sm2 px-2 py-0.5 text-[11px] font-bold',
                d.ageDays >= 7 ? 'bg-red-soft text-red' : d.ageDays >= 3 ? 'bg-gold-soft text-ink' : 'bg-surface-alt text-ink-soft'
              )}
            >
              {ageLabel(d.ageDays)}
            </span>
            <div className="flex w-full gap-1.5 sm:w-auto">
              <Button type="button" size="sm" className="flex-1 sm:flex-none" onClick={() => sendNow(d)} disabled={sendingId === d.id}>
                <Send size={12} /> {sendingId === d.id ? 'Sending…' : 'Send'}
              </Button>
              <Button asChild size="sm" variant="outline" className="flex-1 sm:flex-none">
                <Link href={`/invoices/${d.id}`}>Open</Link>
              </Button>
              <Button type="button" size="sm" variant="outline" className="flex-1 border-red-soft text-red hover:bg-red-soft hover:text-red sm:flex-none" onClick={() => setDeleting(d)}>
                Delete…
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <DeleteInvoiceDialog
        invoice={deleting && { id: deleting.id, number: deleting.number, status: 'DRAFT', customer: deleting.customer }}
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={() => router.refresh()}
      />
    </div>
  );
}
