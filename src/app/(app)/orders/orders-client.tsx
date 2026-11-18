'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Receipt, Search, ShoppingBag, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderSource } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { ChannelTag, OrderStatusPill, PAYMENT_LABEL, orderWhen } from '@/components/orders/order-meta';
import { useBulkOrderAction, useOrderAction, useOrders } from '@/hooks/use-orders';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { OrderListRow, OrderTab, listOrders } from '@/actions/orders';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

const TABS: { key: OrderTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'dispatch', label: 'To dispatch' },
  { key: 'out', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'drafts', label: 'Drafts' },
];

const SOURCES: { key: OrderSource | 'all'; label: string }[] = [
  { key: 'all', label: 'All sources' },
  { key: 'WEB', label: 'Web store' },
  { key: 'MANUAL', label: 'Manual' },
];

const PAGE_SIZE = 25;

export function OrdersClient({ initialData, initialTab }: { initialData: Awaited<ReturnType<typeof listOrders>>; initialTab: OrderTab }) {
  const router = useRouter();
  const [tab, setTab] = useState<OrderTab>(initialTab);
  const [source, setSource] = useState<OrderSource | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isSeed = tab === initialTab && source === 'all' && search === '' && page === 1;
  const { data, isFetching } = useOrders({ tab, source, search, page }, isSeed ? initialData : undefined);
  const rows = data?.rows ?? [];
  const counts = data?.counts ?? initialData.counts;
  const action = useOrderAction();
  const bulk = useBulkOrderAction();

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [tab, source, search]);

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runBulk(kind: 'confirm' | 'invoice') {
    try {
      const r = await bulk.mutateAsync({ kind, ids: Array.from(selected) });
      const n = kind === 'confirm' ? (r as { confirmed?: number }).confirmed ?? 0 : (r as { generated?: number }).generated ?? 0;
      const warnings = (r as { warnings?: string[] }).warnings ?? [];
      if (n) toast.success(kind === 'confirm' ? `${n} order${n === 1 ? '' : 's'} confirmed` : `${n} invoice${n === 1 ? '' : 's'} generated`);
      if (warnings.length) toast.warning(warnings[0] + (warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ''));
      if (!n && !warnings.length) toast.message('Nothing to do for the selected orders.');
      setSelected(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function generate(row: OrderListRow) {
    try {
      const r = await action.mutateAsync({ kind: 'invoice', id: row.id });
      toast.success(`Invoice ${r.invoiceNumber ?? ''} generated for ${row.number}`);
      if (r.warning) toast.warning(r.warning);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
            <ShoppingBag size={18} className="text-brand" /> Orders
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Every sale starts here. Web orders arrive as New; invoices are generated from orders.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/orders/new?quick=1">
              <Zap size={13} /> Quick sale
            </Link>
          </Button>
          <Button asChild>
            <Link href="/orders/new">
              <Plus size={13} /> New order
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl2 border border-line bg-surface shadow-card">
        <div role="tablist" className="flex overflow-x-auto border-b border-line px-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[12.5px] font-bold transition-colors',
                tab === t.key ? 'border-brand text-ink' : 'border-transparent text-ink-soft hover:text-ink'
              )}
            >
              {t.label}
              <span className={cn('rounded-sm2 px-1.5 text-[10.5px] tabular-nums', t.key === 'new' && counts.new > 0 ? 'bg-brand text-white' : 'bg-surface-alt text-ink-soft')}>{counts[t.key]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <div className="relative w-full sm:w-72">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Order number, customer or phone" className="pl-8" aria-label="Search orders" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Source">
            {SOURCES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSource(s.key)}
                className={cn('h-8 rounded-sm2 border px-2.5 text-[12px] font-semibold transition-colors', source === s.key ? 'border-ink bg-ink text-surface' : 'border-line text-ink-soft hover:text-ink')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-light/60 px-3 py-2 text-[12.5px] font-bold text-brand-dark">
            {selected.size} selected
            <Button size="sm" variant="outline" onClick={() => runBulk('confirm')} disabled={bulk.isPending}>
              <CheckCircle2 size={13} /> Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulk('invoice')} disabled={bulk.isPending}>
              <Receipt size={13} /> Generate invoices
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-ink-faint">
            <ShoppingBag size={28} />
            <p className="text-[13.5px] font-bold text-ink-soft">{search ? 'No orders match.' : tab === 'new' ? 'No web orders waiting.' : 'No orders here yet.'}</p>
            {!search && tab === 'all' && (
              <Button size="sm" asChild>
                <Link href="/orders/new">
                  <Plus size={13} /> Take your first order
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', isFetching && 'opacity-70')}>
            <table className="w-full min-w-[860px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                  <th className="w-9 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allOnPage}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                      aria-label="Select all on this page"
                      className="h-3.5 w-3.5 accent-[hsl(var(--brand))]"
                    />
                  </th>
                  <th className="px-2.5 py-2.5">Order</th>
                  <th className="px-2.5 py-2.5">Customer</th>
                  <th className="px-2.5 py-2.5">Source</th>
                  <th className="px-2.5 py-2.5 text-right">Total</th>
                  <th className="px-2.5 py-2.5">Payment</th>
                  <th className="px-2.5 py-2.5">Status</th>
                  <th className="px-2.5 py-2.5">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((o) => (
                  <tr key={o.id} onClick={() => router.push(`/orders/${o.id}`)} className="cursor-pointer transition-colors hover:bg-bg">
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} aria-label={`Select ${o.number}`} className="h-3.5 w-3.5 accent-[hsl(var(--brand))]" />
                    </td>
                    <td className="px-2.5 py-2.5">
                      <Link href={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12.5px] font-bold text-ink hover:text-brand">
                        {o.number}
                      </Link>
                      <div className="text-[11px] text-ink-faint">{orderWhen(o.createdAt)}</div>
                    </td>
                    <td className="max-w-[220px] px-2.5 py-2.5">
                      <div className="truncate font-semibold text-ink">{o.customerName}</div>
                      <div className="truncate text-[11px] text-ink-faint">
                        {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                        {o.deliverySlot ? ` · ${o.deliverySlot}` : ''}
                        {o.couponCode ? ` · ${o.couponCode}` : ''}
                      </div>
                    </td>
                    <td className="px-2.5 py-2.5">
                      <ChannelTag channel={o.channel} />
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono font-bold tabular-nums text-ink">{fmtInr(o.total)}</td>
                    <td className="px-2.5 py-2.5 text-[12px] text-ink-soft">{o.invoice?.status === 'PAID' ? <span className="font-bold text-green">Paid</span> : PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod}</td>
                    <td className="px-2.5 py-2.5">
                      <OrderStatusPill status={o.status} />
                    </td>
                    <td className="px-2.5 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {o.invoice ? (
                        <Link href={`/invoices/${o.invoice.id}`} className="inline-flex items-center gap-1 font-mono text-[11.5px] text-ink hover:text-brand">
                          <Receipt size={12} /> {o.invoice.number}
                        </Link>
                      ) : ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status) ? (
                        <Button size="sm" variant="outline" className="h-7 text-[11.5px]" onClick={() => generate(o)} disabled={action.isPending}>
                          Generate
                        </Button>
                      ) : (
                        <span className="text-[11px] text-ink-faint">{o.status === 'CANCELLED' ? '—' : 'After confirming'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > PAGE_SIZE && (
          <div className="border-t border-line px-3 py-2">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
