'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Receipt, Copy, Trash2, Eye, Pencil, IndianRupee, ArrowRight, Filter, Plus, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetIcon, SheetTitle } from '@/components/ui/sheet';
import { DateRangeFilter } from '@/components/filters/date-range-filter';
import { fmtInr } from '@/lib/gst';
import { customerDisplayName } from '@/lib/customer';
import { resolveDateRange, type DateFilterMode } from '@/lib/dates';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useInvoicesPage, useInvoiceStatusCounts, useDeleteInvoice, useDuplicateInvoice, useRecordPayment } from '@/hooks/use-invoices';
import { useCustomersForFilter } from '@/hooks/use-customers';
import type { InvoiceSort } from '@/actions/invoices';

type GstTypeFilter = 'all' | 'intra' | 'inter';

type Invoice = {
  id: string;
  number: string;
  date: string;
  due: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID';
  customer: { name: string; shopName?: string | null; state: string };
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

const PAGE_SIZE = 10;

function groupKey(inv: Invoice) {
  return inv.isOverdue ? 'Overdue' : inv.status;
}

export function InvoicesClient({ initialData, initialStatus, initialDate }: { initialData: { items: Invoice[]; total: number }; initialStatus: string; initialDate: string }) {
  const [filter, setFilter] = useState(initialStatus);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [sort, setSort] = useState<InvoiceSort>('newest');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const deleteInvoice = useDeleteInvoice();
  const duplicateInvoice = useDuplicateInvoice();
  const { data: customerOptions } = useCustomersForFilter();

  // Defaults to all-time (matching the server's SSR-seeded fetch — see
  // invoices/page.tsx) so the list opens showing full history; "Today" or a
  // custom range are one click away.
  const [dateMode, setDateMode] = useState<DateFilterMode>('all');
  const [customFrom, setCustomFrom] = useState(initialDate);
  const [customTo, setCustomTo] = useState(initialDate);
  const { from: dateFrom, to: dateTo } = resolveDateRange(dateMode, customFrom, customTo);

  const [customerId, setCustomerId] = useState('all');
  const [amountMinInput, setAmountMinInput] = useState('');
  const [amountMaxInput, setAmountMaxInput] = useState('');
  const amountMin = amountMinInput.trim() === '' ? undefined : Number(amountMinInput);
  const amountMax = amountMaxInput.trim() === '' ? undefined : Number(amountMaxInput);
  const [gstType, setGstType] = useState<GstTypeFilter>('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const hasMoreFiltersActive = customerId !== 'all' || amountMin !== undefined || amountMax !== undefined || gstType !== 'all';

  useEffect(
    () => setPage(1),
    [search, filter, sort, dateMode, customFrom, customTo, customerId, amountMin, amountMax, gstType]
  );

  const isDefaultParams = filter === initialStatus && search === '' && sort === 'newest' && page === 1 && dateMode === 'all' && !hasMoreFiltersActive;
  const { data, isFetching, isLoading } = useInvoicesPage(
    { status: filter, search, sort, page, pageSize: PAGE_SIZE, dateFrom, dateTo, customerId: customerId === 'all' ? undefined : customerId, amountMin, amountMax, gstType },
    isDefaultParams ? initialData : undefined
  );
  const pageItems = (data?.items ?? []) as Invoice[];
  const total = data?.total ?? 0;

  // Full-set counts (not just this page) for the "Overdue · N" group labels.
  const { data: statusCounts } = useInvoiceStatusCounts(search, dateFrom, dateTo, { customerId: customerId === 'all' ? undefined : customerId, amountMin, amountMax, gstType });

  const groups = useMemo(() => {
    if (filter !== 'all') return [{ key: filter, items: pageItems, count: total }];
    const map = new Map<string, Invoice[]>();
    for (const inv of pageItems) map.set(groupKey(inv), [...(map.get(groupKey(inv)) ?? []), inv]);
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({ key: k, items: map.get(k)!, count: statusCounts?.[k] ?? map.get(k)!.length }));
  }, [pageItems, filter, total, statusCounts]);

  const selected = pageItems.find((i) => i.id === selectedId) ?? null;
  const deleteTarget = pageItems.find((i) => i.id === deleteTargetId) ?? null;

  function selectRow(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    try {
      await deleteInvoice.mutateAsync(deleteTargetId);
      toast.success('Invoice deleted');
      if (selectedId === deleteTargetId) setSelectedId(null);
      setDeleteTargetId(null);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete this invoice');
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const newId = await duplicateInvoice.mutateAsync(id);
      window.location.href = `/invoices/${newId}`;
    } catch (e: any) {
      toast.error(e.message ?? 'Could not duplicate this invoice');
    }
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

      <div className="mb-4 rounded-xl2 border border-line bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search invoice #, customer, or shop name…"
            className="max-w-xs flex-shrink-0"
          />
          <div className="flex flex-1 gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <Button key={f.id} type="button" size="sm" variant={filter === f.id ? 'default' : 'outline'} onClick={() => setFilter(f.id)}>
                {f.label}
              </Button>
            ))}
          </div>
          <DateRangeFilter mode={dateMode} onModeChange={setDateMode} from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />
          <Select value={sort} onValueChange={(v) => setSort(v as InvoiceSort)}>
            <SelectTrigger className="h-8 w-[170px] flex-shrink-0 text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="amount-desc">Amount: high-low</SelectItem>
              <SelectItem value="amount-asc">Amount: low-high</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant={hasMoreFiltersActive ? 'default' : 'outline'}
            onClick={() => setShowMoreFilters((v) => !v)}
            className="flex-shrink-0"
          >
            <SlidersHorizontal size={12} /> More filters{hasMoreFiltersActive ? ` · ${[customerId !== 'all', amountMin !== undefined || amountMax !== undefined, gstType !== 'all'].filter(Boolean).length}` : ''}
          </Button>
        </div>

        {showMoreFilters && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-2.5">
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-8 w-[200px] flex-shrink-0 text-[11.5px]">
                <SelectValue placeholder="All customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {customerOptions?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {customerDisplayName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-shrink-0 items-center gap-1 rounded-sm2 border border-line bg-bg px-2 py-1">
              <span className="text-[11px] font-bold text-ink-faint">₹</span>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={amountMinInput}
                onChange={(e) => setAmountMinInput(e.target.value)}
                placeholder="Min"
                className="w-[68px] border-none bg-transparent font-mono text-[11px] text-ink-body outline-none"
              />
              <span className="text-ink-faint">–</span>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={amountMaxInput}
                onChange={(e) => setAmountMaxInput(e.target.value)}
                placeholder="Max"
                className="w-[68px] border-none bg-transparent font-mono text-[11px] text-ink-body outline-none"
              />
            </div>

            <Select value={gstType} onValueChange={(v) => setGstType(v as GstTypeFilter)}>
              <SelectTrigger className="h-8 w-[170px] flex-shrink-0 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All GST types</SelectItem>
                <SelectItem value="intra">Intra-state (CGST+SGST)</SelectItem>
                <SelectItem value="inter">Inter-state (IGST)</SelectItem>
              </SelectContent>
            </Select>

            {hasMoreFiltersActive && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCustomerId('all');
                  setAmountMinInput('');
                  setAmountMaxInput('');
                  setGstType('all');
                }}
                className="flex-shrink-0 text-ink-faint"
              >
                <X size={12} /> Clear
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <SkeletonTable cols={6} />
      ) : total === 0 ? (
        <div className="rounded-xl2 border border-line bg-surface p-12 text-center text-ink-faint shadow-card">
          <Filter size={22} className="mx-auto mb-2" />
          <p className="text-[13px]">No invoices match these filters.</p>
        </div>
      ) : (
        <div className={`rounded-xl2 border border-line bg-surface shadow-card transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  {filter === 'all' && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="bg-surface-alt py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-soft">
                        {GROUP_LABEL[g.key]} · {g.count}
                      </TableCell>
                    </TableRow>
                  )}
                  {g.items.map((inv) => (
                    <TableRow
                      key={inv.id}
                      onClick={() => selectRow(inv.id)}
                      className={`cursor-pointer ${selectedId === inv.id ? 'bg-brand-light' : ''}`}
                    >
                      <TableCell className="font-mono font-bold text-ink">{inv.number}</TableCell>
                      <TableCell className="text-ink-body">{customerDisplayName(inv.customer)}</TableCell>
                      <TableCell className="text-ink-faint">{new Date(inv.date).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell className="text-ink-faint">{new Date(inv.due).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-ink-soft">{fmtInr(inv.computedTotal)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="View invoice"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectRow(inv.id);
                            }}
                          >
                            <Eye size={14} />
                          </Button>
                          {inv.status !== 'PAID' && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Edit invoice"
                              className="h-8 w-8"
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link href={`/invoices/new?edit=${inv.id}`}>
                                <Pencil size={14} />
                              </Link>
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Duplicate invoice"
                            className="h-8 w-8"
                            disabled={duplicateInvoice.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicate(inv.id);
                            }}
                          >
                            <Copy size={14} />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Delete invoice"
                            className="h-8 w-8 hover:bg-brand-light hover:text-brand-dark"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTargetId(inv.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <Sheet open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent>
          {selected && (
            <InvoiceDetail
              key={selected.id}
              invoice={selected}
              onDeleteClick={() => setDeleteTargetId(selected.id)}
              onDuplicate={() => handleDuplicate(selected.id)}
              duplicatePending={duplicateInvoice.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="Delete invoice"
        description={
          <>
            Delete <b className="font-mono font-bold text-ink">{deleteTarget?.number}</b>? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete invoice"
        pending={deleteInvoice.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function InvoiceDetail({
  invoice,
  onDeleteClick,
  onDuplicate,
  duplicatePending,
}: {
  invoice: Invoice;
  onDeleteClick: () => void;
  onDuplicate: () => void;
  duplicatePending: boolean;
}) {
  const [showPayment, setShowPayment] = useState(false);

  return (
    <>
      <SheetHeader>
        <SheetIcon>
          <Receipt size={16} />
        </SheetIcon>
        <div className="min-w-0 flex-1">
          <SheetTitle className="font-mono">{invoice.number}</SheetTitle>
          <p className="truncate text-[12px] text-ink-soft">
            {customerDisplayName(invoice.customer)} · {new Date(invoice.date).toLocaleDateString('en-IN')}
          </p>
        </div>
        <StatusBadge status={invoice.status} overdue={invoice.isOverdue} />
      </SheetHeader>

      <SheetBody>
        <div className="mb-4 grid grid-cols-4 gap-2.5">
          <Stat label="Total" value={fmtInr(invoice.computedTotal)} />
          <Stat label="Paid" value={fmtInr(invoice.amountPaid)} good={invoice.amountPaid > 0} />
          <Stat label="Balance due" value={fmtInr(invoice.balanceDue)} warn={invoice.balanceDue > 0} />
          <Stat label="Line items" value={String(invoice.items.length)} />
        </div>

        <div className="space-y-1.5 text-[12.5px]">
          <Row k="Due" v={new Date(invoice.due).toLocaleDateString('en-IN')} />
          <Row k="Bill to" v={`${customerDisplayName(invoice.customer)} · ${invoice.customer.state}`} />
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
      </SheetBody>

      <SheetFooter>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDeleteClick} className="border-red-soft text-red hover:bg-red-soft">
            <Trash2 size={12} /> Delete
          </Button>
          {invoice.status !== 'PAID' && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/invoices/new?edit=${invoice.id}`}>
                <Pencil size={12} /> Edit
              </Link>
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onDuplicate} disabled={duplicatePending}>
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
      </SheetFooter>
    </>
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
        {recordPayment.isPending ? 'Saving…' : 'Received'}
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
      <div className={`font-mono text-[14px] font-extrabold ${warn ? 'text-red' : good ? 'text-green' : 'text-ink'}`}>{value}</div>
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
