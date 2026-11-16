'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Receipt, Copy, Trash2, Pencil, IndianRupee, Filter, Plus, SlidersHorizontal, X, Download, MoreHorizontal, MessageCircle, FileMinus } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonTable } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RecordPaymentDialog } from '@/components/invoices/record-payment-dialog';
import { useCurrentUser } from '@/components/current-user';
import { PeriodPicker, type PeriodValue } from '@/components/filters/period-picker';
import { InvoiceTotals, selectionTotals } from '@/components/invoices/invoice-totals';
import { fmtInr } from '@/lib/gst';
import { customerDisplayName } from '@/lib/customer';
import { resolveDashboardRange } from '@/lib/dashboard-period';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useInvoicesPage, useInvoiceStatusCounts, useInvoiceSummary, useDuplicateInvoice, useWhatsAppShare } from '@/hooks/use-invoices';
import { DeleteInvoiceDialog } from '@/components/invoices/delete-invoice-dialog';
import { RemindersDialog } from '@/components/invoices/reminders-dialog';
import { useCustomersForFilter } from '@/hooks/use-customers';
import type { InvoiceSort } from '@/actions/invoices';

type GstTypeFilter = 'all' | 'intra' | 'inter';

type Invoice = {
  id: string;
  number: string;
  date: string;
  due: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID';
  customer: { name: string; shopName?: string | null; state: string; phone?: string | null };
  lastRemindedAt?: string | null;
  computedTotal: number;
  amountPaid: number;
  balanceDue: number;
  isOverdue: boolean;
  itemCount: number;
  payments: { amount: number; date: string; mode: string | null }[];
};

// Status buttons pick one or several (Paid + Draft…); "All" clears them.
// The list, its group headings and the totals strip all follow the pick.
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'SENT', label: 'Sent' },
  { id: 'PARTIALLY_PAID', label: 'Part-paid' },
  { id: 'PAID', label: 'Paid' },
  { id: 'OVERDUE', label: 'Overdue' },
];
const FILTER_ORDER = FILTERS.map((f) => f.id);

const GROUP_ORDER = ['Overdue', 'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID'];
const GROUP_LABEL: Record<string, string> = { Overdue: 'Overdue', OVERDUE: 'Overdue', DRAFT: 'Draft', SENT: 'Sent', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid' };

const PAGE_SIZE = 10;

function groupKey(inv: Invoice) {
  return inv.isOverdue ? 'Overdue' : inv.status;
}

export function InvoicesClient({
  initialData,
  initialStatus,
  initialDate,
  openReminders = false,
}: {
  initialData: { items: Invoice[]; total: number };
  initialStatus: string;
  initialDate: string;
  /** `?remind=1` — the Dashboard's overdue banner opens the reminders list. */
  openReminders?: boolean;
}) {
  const [filter, setFilter] = useState(initialStatus || 'all');
  const picked = useMemo(() => (filter === 'all' ? [] : filter.split(',').filter((x) => FILTER_ORDER.includes(x))), [filter]);
  function toggleStatus(id: string) {
    if (id === 'all') return setFilter('all');
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const ordered = FILTER_ORDER.filter((x) => next.has(x));
    setFilter(ordered.length ? ordered.join(',') : 'all');
  }
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [sort, setSort] = useState<InvoiceSort>('newest');
  const [page, setPage] = useState(1);
  const router = useRouter();
  const { isOwner } = useCurrentUser();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(openReminders);
  const duplicateInvoice = useDuplicateInvoice();
  const whatsApp = useWhatsAppShare();
  const { data: customerOptions } = useCustomersForFilter();

  // Defaults to all-time (matching the server's SSR-seeded fetch — see
  // invoices/page.tsx) so the list opens showing full history; "Today" or a
  // custom range are one click away.
  const [period, setPeriod] = useState<PeriodValue>({ preset: 'all' });
  const range = period.preset === 'all' ? null : resolveDashboardRange({ period: period.preset, from: period.from, to: period.to }, initialDate);
  const dateFrom = range?.from;
  const dateTo = range?.to;

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
    [search, filter, sort, period, customerId, amountMin, amountMax, gstType]
  );

  const isDefaultParams = filter === initialStatus && search === '' && sort === 'newest' && page === 1 && period.preset === 'all' && !hasMoreFiltersActive;
  const { data, isFetching, isLoading } = useInvoicesPage(
    { status: filter, search, sort, page, pageSize: PAGE_SIZE, dateFrom, dateTo, customerId: customerId === 'all' ? undefined : customerId, amountMin, amountMax, gstType },
    isDefaultParams ? initialData : undefined
  );
  const pageItems = (data?.items ?? []) as Invoice[];
  const total = data?.total ?? 0;

  // Deleting the last row on the last page would otherwise leave an empty
  // page ("Showing 11–10 of 10") — step back to the last page with rows.
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (!isFetching && page > lastPage) setPage(lastPage);
  }, [total, page, isFetching]);

  // Full-set counts (not just this page) for the "Overdue · N" group labels.
  const otherFilters = { customerId: customerId === 'all' ? undefined : customerId, amountMin, amountMax, gstType };
  const { data: statusCounts } = useInvoiceStatusCounts(search, dateFrom, dateTo, otherFilters);
  // Count, total, paid and owed per status — the totals strip adds up the
  // picked ones, and each status button shows its count.
  const { data: summary, isFetching: summaryFetching } = useInvoiceSummary(search, dateFrom, dateTo, otherFilters);
  const selection = useMemo(() => selectionTotals(summary, picked), [summary, picked]);
  const chipCount = (id: string) => {
    if (!summary) return null;
    if (id === 'all') return summary.DRAFT.count + summary.SENT.count + summary.PARTIALLY_PAID.count + summary.PAID.count;
    if (id === 'OVERDUE') return summary.overdue.SENT.count + summary.overdue.PARTIALLY_PAID.count;
    return summary[id as 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID'].count;
  };

  const groups = useMemo(() => {
    if (picked.length === 1) return [{ key: picked[0], items: pageItems, count: total }];
    const map = new Map<string, Invoice[]>();
    for (const inv of pageItems) map.set(groupKey(inv), [...(map.get(groupKey(inv)) ?? []), inv]);
    // Full-set counts where they're exact for this pick, else this page's.
    const exact = (k: string) => filter === 'all' || picked.includes(k === 'Overdue' ? 'OVERDUE' : k);
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({ key: k, items: map.get(k)!, count: exact(k) ? (statusCounts?.[k] ?? map.get(k)!.length) : map.get(k)!.length }));
  }, [pageItems, picked, filter, total, statusCounts]);

  const deleteTarget = pageItems.find((i) => i.id === deleteTargetId) ?? null;

  async function handleDuplicate(id: string) {
    try {
      const { invoiceId } = await duplicateInvoice.mutateAsync(id);
      toast.success('Duplicated as a new draft');
      if (invoiceId) router.push(`/invoices/${invoiceId}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not duplicate this invoice');
    }
  }

  function sendReminder(inv: Invoice) {
    const win = window.open('', '_blank');
    const name = customerDisplayName(inv.customer);
    whatsApp.mutate(
      {
        invoiceId: inv.id,
        phone: inv.customer.phone ?? null,
        win,
        reminder: true,
        buildMessage: (url) =>
          `Hello ${name}, a gentle reminder: invoice ${inv.number} has ${fmtInr(inv.balanceDue)} due (due ${new Date(inv.due).toLocaleDateString('en-IN')}).\n\nView invoice: ${url}\n\nThank you!`,
      },
      {
        onSuccess: () => toast.success('Reminder opened in WhatsApp'),
        onError: (e: any) => toast.error(e?.message ?? 'Could not create the reminder link'),
      }
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
            <Receipt size={18} className="text-brand" /> Invoices
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Click an invoice to open it. Paid invoices open as a preview first.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(statusCounts?.Overdue ?? 0) > 0 && (
            <Button variant="outline" onClick={() => setRemindersOpen(true)}>
              <MessageCircle size={13} /> Payment reminders
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/credit-notes">
              <FileMinus size={13} /> Credit notes
            </Link>
          </Button>
          <Button asChild>
            <Link href="/invoices/new">
              <Plus size={13} /> New invoice
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-3 rounded-xl2 border border-line bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search invoice #, customer, or shop name…"
            className="max-w-xs flex-shrink-0"
          />
          <div role="group" aria-label="Statuses" className="flex flex-1 flex-wrap gap-1">
            {FILTERS.map((f) => {
              const on = f.id === 'all' ? filter === 'all' : picked.includes(f.id);
              const n = chipCount(f.id);
              return (
                <Button key={f.id} type="button" size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={() => toggleStatus(f.id)}>
                  {f.label}
                  {n !== null && <span className={`font-mono text-[10.5px] ${on ? 'opacity-80' : 'text-ink-faint'}`}>{n}</span>}
                </Button>
              );
            })}
          </div>
          <PeriodPicker value={period} onChange={setPeriod} today={initialDate} allowAll />
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
                    {'active' in c && c.active === false ? ' (disabled)' : ''}
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

      <InvoiceTotals sel={selection} picked={picked} periodLabel={range ? range.dates : 'All time'} loading={summaryFetching && !summary} />

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
                  {(filter === 'all' || picked.length > 1) && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="bg-surface-alt py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-soft">
                        {GROUP_LABEL[g.key]} · {g.count}
                      </TableCell>
                    </TableRow>
                  )}
                  {g.items.map((inv) => (
                    <TableRow
                      key={inv.id}
                      onClick={() => router.push(`/invoices/${inv.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget === e.target && router.push(`/invoices/${inv.id}`)}
                      tabIndex={0}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-mono font-bold text-ink">{inv.number}</TableCell>
                      <TableCell className="text-ink-body">{customerDisplayName(inv.customer)}</TableCell>
                      <TableCell className="text-ink-faint">{new Date(inv.date).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell className="text-ink-faint">
                        {new Date(inv.due).toLocaleDateString('en-IN')}
                        {inv.isOverdue && inv.lastRemindedAt && (
                          <div className="text-[10px] text-ink-faint">reminded {new Date(inv.lastRemindedAt).toLocaleDateString('en-IN')}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} overdue={inv.isOverdue} />
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-ink-soft">
                        {fmtInr(inv.computedTotal)}
                        {inv.status === 'PARTIALLY_PAID' && <div className="text-[10.5px] font-semibold text-red">{fmtInr(inv.balanceDue)} due</div>}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button type="button" size="icon" variant="ghost" aria-label={`Download ${inv.number} PDF`} className="h-8 w-8" asChild>
                            <a href={`/api/invoices/${inv.id}/pdf`} download>
                              <Download size={14} />
                            </a>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" size="icon" variant="ghost" aria-label={`More actions for ${inv.number}`} className="h-8 w-8">
                                <MoreHorizontal size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[200px]">
                              <DropdownMenuItem onClick={() => router.push(inv.status === 'PAID' ? `/invoices/${inv.id}?edit=1` : `/invoices/${inv.id}`)}>
                                <Pencil size={14} /> Edit
                              </DropdownMenuItem>
                              {inv.balanceDue > 0.004 && (
                                <DropdownMenuItem onClick={() => setPaymentTarget(inv)}>
                                  <IndianRupee size={14} /> Record payment
                                </DropdownMenuItem>
                              )}
                              {inv.balanceDue > 0.004 && inv.status !== 'DRAFT' && (
                                <DropdownMenuItem onClick={() => sendReminder(inv)}>
                                  <MessageCircle size={14} /> WhatsApp reminder
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleDuplicate(inv.id)} disabled={duplicateInvoice.isPending}>
                                <Copy size={14} /> Duplicate
                              </DropdownMenuItem>
                              {isOwner && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-red focus:text-red" onClick={() => setDeleteTargetId(inv.id)}>
                                    <Trash2 size={14} /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {paymentTarget && (
        <RecordPaymentDialog
          open={!!paymentTarget}
          onOpenChange={(open) => !open && setPaymentTarget(null)}
          invoiceId={paymentTarget.id}
          invoiceNumber={paymentTarget.number}
          balanceDue={paymentTarget.balanceDue}
          customer={{ name: customerDisplayName(paymentTarget.customer), phone: paymentTarget.customer.phone ?? null }}
        />
      )}

      <RemindersDialog open={remindersOpen} onOpenChange={setRemindersOpen} />

      <DeleteInvoiceDialog
        invoice={deleteTarget && { ...deleteTarget, customer: customerDisplayName(deleteTarget.customer) }}
        open={deleteTargetId !== null && deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      />
    </div>
  );
}
