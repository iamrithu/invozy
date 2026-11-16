'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RecordPaymentDialog } from '@/components/invoices/record-payment-dialog';
import type { OpenInvoice } from '@/actions/dashboard';
import { fmtInr } from '@/lib/gst';

function dayMonth(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** The dashboard's "Record payment": pick the unpaid invoice the money is
 * for (search by customer or number, oldest due first), then the same
 * payment dialog the invoice screens use. The page refreshes afterwards so
 * every figure on it moves. */
export function RecordPaymentLauncher({ invoices, currency }: { invoices: OpenInvoice[]; currency: string }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<OpenInvoice | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? invoices.filter((i) => i.customer.toLowerCase().includes(q) || i.number.toLowerCase().includes(q)) : invoices;
    return list.slice(0, 60);
  }, [invoices, query]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery('');
          setPickerOpen(true);
        }}
        disabled={invoices.length === 0}
        title={invoices.length === 0 ? 'No unpaid invoices' : 'Record money received against an invoice'}
        className="flex items-center gap-1.5 rounded-sm2 border border-line bg-surface px-3 py-2 text-[12.5px] font-bold text-ink-body transition-colors hover:border-brand/50 hover:text-ink disabled:opacity-50"
      >
        <Wallet size={14} /> Record payment
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet size={16} className="text-brand" /> Record a payment
            </DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-[12.5px] text-ink-soft">
            Pick the invoice the money is for. {invoices.length} unpaid, oldest due first.
          </p>
          <label className="flex items-center gap-2 rounded-sm2 border border-line bg-bg px-2.5 py-2 focus-within:border-brand">
            <Search size={14} className="flex-shrink-0 text-ink-faint" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Customer or invoice number"
              aria-label="Search unpaid invoices"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
            />
          </label>
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-sm2 border border-line">
            {matches.length === 0 ? (
              <li className="px-3 py-4 text-[12.5px] text-ink-faint">No unpaid invoice matches &ldquo;{query}&rdquo;.</li>
            ) : (
              matches.map((inv) => (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChosen(inv);
                      setPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold text-ink">{inv.customer}</span>
                      <span className="block truncate text-[11px] text-ink-faint">
                        <span className="font-mono">{inv.number}</span> ·{' '}
                        {inv.overdue ? <span className="font-semibold text-red">overdue since {dayMonth(inv.due)}</span> : `due ${dayMonth(inv.due)}`}
                      </span>
                    </span>
                    <span className="flex-shrink-0 font-mono text-[12.5px] font-bold text-ink">{fmtInr(inv.balance, currency)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>

      {chosen && (
        <RecordPaymentDialog
          open
          onOpenChange={(o) => {
            if (!o) setChosen(null);
          }}
          invoiceId={chosen.id}
          invoiceNumber={chosen.number}
          balanceDue={chosen.balance}
          customer={{ name: chosen.customer, phone: chosen.phone }}
          onRecorded={() => router.refresh()}
        />
      )}
    </>
  );
}
