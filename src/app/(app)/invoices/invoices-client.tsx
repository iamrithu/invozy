'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Receipt, Copy, Trash2, IndianRupee, ArrowRight, Filter, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtInr } from '@/lib/gst';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useInvoicesPage, useInvoiceStatusCounts, useDeleteInvoice, useDuplicateInvoice, useRecordPayment } from '@/hooks/use-invoices';
import type { InvoiceSort } from '@/actions/invoices';

type Invoice = {
  id: string;
  number: string;
  date: string;
  due: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID';
  customer: { name: string; state: string };
  computedTotal: number;
  amountPaid: number;
  balanceDue: number;
  isOverdue: boolean;
  items: any[];
  payments: { amount: number; date: string; mode: string | null }[];
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'SENT', label: 'Sent' },
  { id: 'PARTIALLY_PAID', label: 'Partial' },
  { id: 'PAID', label: 'Paid' },
];

const GROUP_ORDER = ['Overdue', 'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID'];
const GROUP_LABEL: Record<string, string> = { Overdue: 'Overdue', DRAFT: 'Draft', SENT: 'Sent', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid' };

const PAGE_SIZE = 20;

function groupKey(inv: Invoice) {
  return inv.isOverdue ? 'Overdue' : inv.status;
}

export function InvoicesClient({ initialData, initialStatus }: { initialData: { items: Invoice[]; total: number }; initialStatus: string }) {
  const [filter, setFilter] = useState(initialStatus);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [sort, setSort] = useState<InvoiceSort>('newest');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => setPage(1), [search, filter, sort]);

  const isDefaultParams = filter === initialStatus && search === '' && sort === 'newest' && page === 1;
  const { data, isFetching, isLoading } = useInvoicesPage({ status: filter, search, sort, page, pageSize: PAGE_SIZE }, isDefaultParams ? initialData : undefined);
  const pageItems = (data?.items ?? []) as Invoice[];
  const total = data?.total ?? 0;

  // Full-set counts (not just this page) for the "Overdue · N" group labels.
  const { data: statusCounts } = useInvoiceStatusCounts(search);

  const groups = useMemo(() => {
    if (filter !== 'all') return [{ key: filter, items: pageItems, count: total }];
    const map = new Map<string, Invoice[]>();
    for (const inv of pageItems) map.set(groupKey(inv), [...(map.get(groupKey(inv)) ?? []), inv]);
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({ key: k, items: map.get(k)!, count: statusCounts?.[k] ?? map.get(k)!.length }));
  }, [pageItems, filter, total, statusCounts]);

  const selected = pageItems.find((i) => i.id === selectedId) ?? null;

  function selectRow(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
            <Receipt size={18} className="text-brand" /> Invoices
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Search, filter, and drill into any invoice's status and payment history.</p>
        </div>
        <Button asChild>
          <Link href="/invoices/new">
            <Plus size={13} /> New invoice
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[350px_1fr]">
        <div className="flex max-h-[74vh] flex-col rounded-xl2 border border-line bg-surface shadow-card">
          <div className={`flex-1 overflow-y-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            <div className="sticky top-0 z-[1] space-y-2 border-b border-line bg-surface p-3">
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search number or customer…" />
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1 overflow-x-auto">
                  {FILTERS.map((f) => (
                    <Button key={f.id} type="button" size="sm" variant={filter === f.id ? 'default' : 'outline'} onClick={() => setFilter(f.id)}>
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Select value={sort} onValueChange={(v) => setSort(v as InvoiceSort)}>
                <SelectTrigger className="h-8 w-full text-[11.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="amount-desc">Amount: high-low</SelectItem>
                  <SelectItem value="amount-asc">Amount: low-high</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isLoading ? (
              <SkeletonList />
            ) : (
              <>
                {total === 0 && (
                  <div className="p-8 text-center text-ink-faint">
                    <Filter size={22} className="mx-auto mb-2" />
                    <p className="text-[13px]">No invoices match these filters.</p>
                  </div>
                )}
                {groups.map((g) => (
                  <div key={g.key}>
                    {filter === 'all' && (
                      <div className="sticky top-[125px] z-[1] bg-surface-alt px-3.5 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-soft">
                        {GROUP_LABEL[g.key]} · {g.count}
                      </div>
                    )}
                    {g.items.map((inv) => (
                      <button
                        key={inv.id}
                        onClick={() => selectRow(inv.id)}
                        className={`flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-0 hover:bg-bg ${
                          selectedId === inv.id ? 'bg-brand-light shadow-[inset_3px_0_0_theme(colors.brand.DEFAULT)]' : ''
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-bold text-ink">{inv.number}</div>
                          <div className="truncate text-[11px] text-ink-faint">
                            {inv.customer.name} · {new Date(inv.date).toLocaleDateString('en-IN')}
                          </div>
                        </span>
                        <span className="flex flex-shrink-0 flex-col items-end gap-1">
                          <StatusBadge status={inv.status} />
                          <span className="font-mono text-[11.5px] font-bold text-ink-soft">{fmtInr(inv.computedTotal)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>

        <div className="rounded-xl2 border border-line bg-surface p-5 shadow-card">
          {selected ? (
            <InvoiceDetail key={selected.id} invoice={selected} onDeleted={() => setSelectedId(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-ink-faint">
              <Receipt size={34} />
              <p className="text-[13.5px] font-bold text-ink-soft">Select an invoice to see its details</p>
              <Button asChild>
                <Link href="/invoices/new">New invoice</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceDetail({ invoice, onDeleted }: { invoice: Invoice; onDeleted: () => void }) {
  const [showPayment, setShowPayment] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteInvoice = useDeleteInvoice();
  const duplicateInvoice = useDuplicateInvoice();
  const pending = deleteInvoice.isPending || duplicateInvoice.isPending;

  async function handleDelete() {
    try {
      await deleteInvoice.mutateAsync(invoice.id);
      setDeleteOpen(false);
      toast.success('Invoice deleted');
      onDeleted();
    } catch (e: any) {
      setDeleteOpen(false);
      toast.error(e.message ?? 'Could not delete this invoice');
    }
  }

  async function handleDuplicate() {
    try {
      const newId = await duplicateInvoice.mutateAsync(invoice.id);
      window.location.href = `/invoices/${newId}`;
    } catch (e: any) {
      toast.error(e.message ?? 'Could not duplicate this invoice');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-sm2 bg-surface-alt text-brand">
            <Receipt size={19} />
          </span>
          <div>
            <h3 className="font-mono text-[16px] font-extrabold text-ink">{invoice.number}</h3>
            <p className="text-[12px] text-ink-soft">
              {invoice.customer.name} · {new Date(invoice.date).toLocaleDateString('en-IN')}
            </p>
          </div>
        </div>
        <StatusBadge status={invoice.status} overdue={invoice.isOverdue} />
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2.5">
        <Stat label="Total" value={fmtInr(invoice.computedTotal)} />
        <Stat label="Paid" value={fmtInr(invoice.amountPaid)} good={invoice.amountPaid > 0} />
        <Stat label="Balance due" value={fmtInr(invoice.balanceDue)} warn={invoice.balanceDue > 0} />
        <Stat label="Line items" value={String(invoice.items.length)} />
      </div>

      <div className="space-y-1.5 text-[12.5px]">
        <Row k="Due" v={new Date(invoice.due).toLocaleDateString('en-IN')} />
        <Row k="Bill to" v={`${invoice.customer.name} · ${invoice.customer.state}`} />
      </div>

      {invoice.payments.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Payment history</div>
          {invoice.payments.map((p, i) => (
            <Row key={i} k={`${new Date(p.date).toLocaleDateString('en-IN')}${p.mode ? ' · ' + p.mode : ''}`} v={`+${fmtInr(p.amount)}`} good />
          ))}
        </div>
      )}

      {showPayment && (
        <PaymentForm
          invoiceId={invoice.id}
          maxAmount={invoice.balanceDue}
          onDone={() => setShowPayment(false)}
          onCancel={() => setShowPayment(false)}
        />
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)} disabled={pending} className="border-brand-light text-brand-dark hover:bg-brand-light">
            <Trash2 size={12} /> Delete
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleDuplicate} disabled={pending}>
            <Copy size={12} /> Duplicate
          </Button>
          {invoice.balanceDue > 0 && !showPayment && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowPayment(true)}>
              <IndianRupee size={12} /> Record payment
            </Button>
          )}
        </div>
        <Button asChild>
          <Link href={`/invoices/${invoice.id}`}>
            Open full view <ArrowRight size={13} />
          </Link>
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete invoice"
        description={
          <>
            Delete <b className="font-mono font-bold text-ink">{invoice.number}</b>? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete invoice"
        pending={deleteInvoice.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function PaymentForm({
  invoiceId,
  maxAmount,
  onDone,
  onCancel,
}: {
  invoiceId: string;
  maxAmount: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const recordPayment = useRecordPayment(invoiceId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    try {
      await recordPayment.mutateAsync({ amount: amt, date: new Date().toISOString() });
      toast.success('Payment recorded');
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not record this payment');
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex items-end gap-2 rounded-md2 border border-line bg-bg p-3">
      <div className="flex-1">
        <label className="mb-1 block text-[11px] font-bold text-ink-faint">Amount (₹)</label>
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
      </div>
      <Button type="submit" disabled={recordPayment.isPending}>
        {recordPayment.isPending ? 'Saving…' : 'Record'}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function Stat({ label, value, warn, good }: { label: string; value: string; warn?: boolean; good?: boolean }) {
  return (
    <div className="rounded-md2 bg-bg p-2.5 text-center">
      <div className={`font-mono text-[14px] font-extrabold ${warn ? 'text-brand-dark' : good ? 'text-green' : 'text-ink'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="flex justify-between border-b border-dashed border-line py-1.5 last:border-0">
      <span className="text-ink-faint">{k}</span>
      <span className={`font-mono font-bold ${good ? 'text-green' : 'text-ink-body'}`}>{v}</span>
    </div>
  );
}
