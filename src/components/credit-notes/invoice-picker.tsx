'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtInr, formatInvoiceDate } from '@/lib/gst';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useInvoicesForCreditNote } from '@/hooks/use-credit-notes';

/** Step one of a credit note opened without `?invoice=`: find the invoice
 * it's for. Only sent, part-paid and paid invoices are listed — a draft
 * isn't a sale yet, so it's simply edited instead. */
export function InvoicePicker() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 300);
  const { data, isLoading, isFetching } = useInvoicesForCreditNote(search);

  return (
    <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
      <div className="border-b border-line p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input
            autoFocus
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search invoice # or customer…"
            className="pl-8"
            aria-label="Search invoices"
          />
        </div>
      </div>
      <div className="flex justify-between border-b border-line bg-surface-alt px-3.5 py-1.5 text-[11px] font-bold text-ink-faint">
        <span>{search ? 'Matching invoices' : 'Recent invoices'}</span>
        <span>Drafts aren&apos;t listed</span>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-3.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data?.length ? (
        <p className="px-4 py-10 text-center text-[13px] text-ink-faint">{search ? 'No sent or paid invoices match that search.' : 'No sent or paid invoices yet.'}</p>
      ) : (
        <ul className={`divide-y divide-line transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          {data.map((inv) => (
            <li key={inv.id}>
              <Link href={`/credit-notes/new?invoice=${inv.id}`} className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-[13px] font-bold text-ink">{inv.number}</span>
                    <span className="truncate text-[12.5px] text-ink-body">{inv.customerName}</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-faint">
                    {formatInvoiceDate(inv.date)}
                    {inv.balanceDue > 0.004 && ` · ${fmtInr(inv.balanceDue)} due`}
                    {inv.creditNotes > 0 && ` · ${inv.creditNotes} credit note${inv.creditNotes === 1 ? '' : 's'} already`}
                  </div>
                </div>
                <span className="hidden sm:inline">
                  <StatusBadge status={inv.status} />
                </span>
                <span className="font-mono text-[13px] font-bold text-ink-soft">{fmtInr(inv.total)}</span>
                <ChevronRight size={14} className="flex-shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
