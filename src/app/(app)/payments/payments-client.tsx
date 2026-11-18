'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Wallet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { listPayments, type PaymentsPage } from '@/actions/payments';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 30;

export function PaymentsClient({ initial, defaultFrom, defaultTo }: { initial: PaymentsPage; defaultFrom: string; defaultTo: string }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [mode, setMode] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(1);
  const isSeed = from === defaultFrom && to === defaultTo && mode === 'all' && search === '' && page === 1;
  const { data = initial, isFetching } = useQuery({
    queryKey: ['payments', { from, to, mode, search, page }],
    queryFn: () => listPayments({ from, to, mode, search, page, pageSize: PAGE_SIZE }),
    initialData: isSeed ? initial : undefined,
    placeholderData: (prev) => prev,
    enabled: !!from && !!to,
  });
  const modes = ['all', ...data.byMode.map((m) => m.mode)];

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
          <Wallet size={18} className="text-brand" /> Payments
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">Every payment received, across all invoices. Record one from its invoice, or when you mark an order delivered.</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <div className="text-[11.5px] font-semibold text-ink-soft">Received</div>
          <div className="mt-1 font-mono text-[22px] font-extrabold tabular-nums text-ink">{fmtInr(data.sum)}</div>
          <div className="text-[11.5px] text-ink-faint">{from === to ? from : `${from} to ${to}`}</div>
        </div>
        {data.byMode.slice(0, 3).map((m) => (
          <div key={m.mode} className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
            <div className="text-[11.5px] font-semibold text-ink-soft">{m.mode}</div>
            <div className="mt-1 font-mono text-[18px] font-bold tabular-nums text-ink">{fmtInr(m.amount)}</div>
            <div className="text-[11.5px] text-ink-faint">
              {m.count} payment{m.count === 1 ? '' : 's'}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl2 border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-end gap-2 border-b border-line px-3 py-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-ink-faint">From</span>
            <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} className="h-9 w-[150px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-ink-faint">To</span>
            <Input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} className="h-9 w-[150px]" />
          </label>
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input value={searchInput} onChange={(e) => (setSearchInput(e.target.value), setPage(1))} placeholder="Receipt, invoice, customer, reference" className="pl-8" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {modes.map((m) => (
              <button key={m} onClick={() => (setMode(m), setPage(1))} className={cn('h-8 rounded-sm2 border px-2.5 text-[12px] font-semibold', mode === m ? 'border-ink bg-ink text-surface' : 'border-line text-ink-soft hover:text-ink')}>
                {m === 'all' ? 'All modes' : m}
              </button>
            ))}
          </div>
        </div>
        {data.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-ink-faint">
            <Wallet size={28} />
            <p className="text-[13.5px] font-bold text-ink-soft">No payments in this period.</p>
          </div>
        ) : (
          <div className={cn('overflow-x-auto', isFetching && 'opacity-70')}>
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2.5">Receipt</th>
                  <th className="px-2.5 py-2.5">Date</th>
                  <th className="px-2.5 py-2.5">Customer</th>
                  <th className="px-2.5 py-2.5">Invoice</th>
                  <th className="px-2.5 py-2.5">Mode</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink">{p.receiptNo ?? '—'}</td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 text-ink-soft">{new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</td>
                    <td className="max-w-[220px] truncate px-2.5 py-2.5 font-semibold text-ink">{p.customerName}</td>
                    <td className="px-2.5 py-2.5">
                      <Link href={`/invoices/${p.invoice.id}`} className="font-mono text-[12px] text-ink hover:text-brand">
                        {p.invoice.number}
                      </Link>
                      {p.orderId && (
                        <Link href={`/orders/${p.orderId}`} className="ml-2 text-[11px] font-semibold text-ink-faint hover:text-brand">
                          Order
                        </Link>
                      )}
                    </td>
                    <td className="px-2.5 py-2.5 text-ink-soft">
                      {p.creditNote ? `Credit note ${p.creditNote}` : p.mode || 'Other'}
                      {p.reference && <div className="text-[11px] text-ink-faint">{p.reference}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-ink">{fmtInr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.total > PAGE_SIZE && (
          <div className="border-t border-line px-3 py-2">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
