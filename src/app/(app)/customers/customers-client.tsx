'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Users, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtInr } from '@/lib/gst';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCustomersPage, useCustomerStates, useCustomerLedger, useDeleteCustomer } from '@/hooks/use-customers';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { initials, hashColor } from '@/lib/avatar';
import type { CustomerSort } from '@/actions/customers';

const PAGE_SIZE = 20;

type Customer = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  state: string;
  gstin: string | null;
  address: string | null;
  terms: string;
  creditLimit: string | number;
  guest: boolean;
};

export function CustomersClient({ initialData }: { initialData: { items: Customer[]; total: number } }) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [stateFilter, setStateFilter] = useState('all');
  const [sort, setSort] = useState<CustomerSort>('name');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => setPage(1), [search, stateFilter, sort]);

  const { data: states } = useCustomerStates();
  const isDefaultParams = search === '' && stateFilter === 'all' && sort === 'name' && page === 1;
  const { data, isFetching, isLoading } = useCustomersPage({ search, state: stateFilter, sort, page, pageSize: PAGE_SIZE }, isDefaultParams ? initialData : undefined);
  const pageItems = (data?.items ?? []) as Customer[];
  const total = data?.total ?? 0;

  const selected = pageItems.find((c) => c.id === selectedId) ?? null;

  function selectRow(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
            <Users size={18} className="text-brand" /> Customers
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">State drives whether an invoice charges CGST + SGST or IGST. Click a row for their billing history.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={13} /> Add customer
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[330px_1fr]">
        <div className="flex max-h-[74vh] flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className={`flex-1 overflow-y-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            <div className="sticky top-0 z-[1] space-y-2 border-b border-line bg-surface p-3">
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name or phone…" />
              <div className="flex gap-2">
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger className="h-8 flex-1 text-[11.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    {(states ?? []).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={(v) => setSort(v as CustomerSort)}>
                  <SelectTrigger className="h-8 w-[132px] text-[11.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="billed-desc">Billed: high-low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isLoading ? (
              <SkeletonList />
            ) : (
              <>
                {total === 0 && <div className="p-6 text-center text-[13px] text-ink-faint">No customers match your filters.</div>}
                {pageItems.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectRow(c.id)}
                    className={`flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-0 hover:bg-bg ${
                      selectedId === c.id ? 'bg-brand-light shadow-[inset_3px_0_0_theme(colors.brand.DEFAULT)]' : ''
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white"
                      style={{ background: hashColor(c.name) }}
                    >
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-ink">
                        {c.name}
                        {c.guest && <span className="ml-1.5 rounded-full bg-surface-alt px-1.5 py-0.5 text-[9px] font-bold text-ink-faint">Guest</span>}
                      </div>
                      <div className="truncate text-[11px] text-ink-faint">{c.state}</div>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>

        <div className="rounded-xl2 border border-line bg-surface p-5 shadow-card">
          {selected ? (
            <CustomerDetail key={selected.id} customer={selected} onEdit={() => setEditOpen(true)} onDeleted={() => setSelectedId(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-ink-faint">
              <Users size={34} />
              <p className="text-[13.5px] font-bold text-ink-soft">Select a customer to view their details and billing history</p>
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={13} /> Add a new customer
              </Button>
            </div>
          )}
        </div>
      </div>

      <CustomerFormDialog open={addOpen} onOpenChange={setAddOpen} mode="create" onSaved={(id) => setSelectedId(id)} />
      {selected && <CustomerFormDialog key={selected.id} open={editOpen} onOpenChange={setEditOpen} mode="edit" customer={selected} />}
    </div>
  );
}

function CustomerDetail({ customer, onEdit, onDeleted }: { customer: Customer; onEdit: () => void; onDeleted: () => void }) {
  const { data: ledger } = useCustomerLedger(customer.id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteCustomer = useDeleteCustomer();

  async function handleDelete() {
    try {
      await deleteCustomer.mutateAsync(customer.id);
      setDeleteOpen(false);
      toast.success('Customer removed');
      onDeleted();
    } catch (e: any) {
      setDeleteOpen(false);
      toast.error(e.message);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-extrabold text-white"
            style={{ background: hashColor(customer.name) }}
          >
            {initials(customer.name)}
          </span>
          <div>
            <h3 className="text-[17px] font-extrabold text-ink">
              {customer.name}
              {customer.guest && <span className="ml-2 rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-bold text-ink-faint">Guest</span>}
            </h3>
            <p className="text-[12px] text-ink-soft">
              {customer.state} {customer.gstin ? `· GSTIN ${customer.gstin}` : '· Unregistered'}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil size={13} /> Edit
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="border-brand-light text-brand-dark hover:bg-brand-light">
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {ledger && (
        <div className="mb-4 grid grid-cols-3 gap-2.5">
          <LedgerStat label="Invoices" value={String(ledger.invoiceCount)} />
          <LedgerStat label="Total billed" value={fmtInr(ledger.totalBilled)} />
          <LedgerStat label="Outstanding" value={fmtInr(ledger.outstanding)} warn={ledger.outstanding > 0} />
        </div>
      )}

      <div className="space-y-2 rounded-lg2 border border-dashed border-line p-3.5 text-[12.5px]">
        {customer.contact && (
          <div className="flex justify-between">
            <span className="text-ink-faint">Contact person</span>
            <span className="font-semibold text-ink-body">{customer.contact}</span>
          </div>
        )}
        {customer.phone && (
          <div className="flex justify-between">
            <span className="text-ink-faint">Phone</span>
            <span className="font-semibold text-ink-body">{customer.phone}</span>
          </div>
        )}
        {customer.email && (
          <div className="flex justify-between">
            <span className="text-ink-faint">Email</span>
            <span className="font-semibold text-ink-body">{customer.email}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink-faint">Payment terms</span>
          <span className="font-semibold text-ink-body">{customer.terms}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-faint">Credit limit</span>
          <span className="font-mono font-semibold text-ink-body">{fmtInr(Number(customer.creditLimit))}</span>
        </div>
        {customer.address && (
          <div className="flex justify-between gap-3">
            <span className="flex-shrink-0 text-ink-faint">Address</span>
            <span className="text-right font-semibold text-ink-body">{customer.address}</span>
          </div>
        )}
      </div>

      {ledger && ledger.invoices.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold text-ink">
            <Receipt size={13} /> Invoices
          </div>
          <div className="overflow-hidden rounded-lg2 border border-line">
            <table className="w-full text-[12.5px]">
              <tbody>
                {ledger.invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b border-line last:border-0">
                    <td className="p-2.5 font-mono font-bold">{inv.number}</td>
                    <td className="p-2.5 text-ink-soft">{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                    <td className="p-2.5 text-right font-mono font-bold">{fmtInr(inv.computedTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remove customer"
        description={
          <>
            Remove <b className="font-bold text-ink">{customer.name}</b>? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete customer"
        pending={deleteCustomer.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function LedgerStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md2 bg-bg p-2.5 text-center">
      <div className={`font-mono text-[14px] font-extrabold ${warn ? 'text-brand-dark' : 'text-ink'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
