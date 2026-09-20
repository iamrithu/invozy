'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Users, Receipt, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetIcon, SheetBody, SheetFooter } from '@/components/ui/sheet';
import { fmtInr } from '@/lib/gst';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCustomersPage, useCustomerStates, useCustomerLedger, useDeleteCustomer } from '@/hooks/use-customers';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { initials, hashColor } from '@/lib/avatar';
import type { CustomerSort } from '@/actions/customers';

const PAGE_SIZE = 10;

type Customer = {
  id: string;
  name: string;
  shopName: string | null;
  contact: string | null;
  phone: string | null;
  altPhone: string | null;
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
  const [viewOpen, setViewOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const deleteCustomer = useDeleteCustomer();

  useEffect(() => setPage(1), [search, stateFilter, sort]);

  const { data: states } = useCustomerStates();
  const isDefaultParams = search === '' && stateFilter === 'all' && sort === 'name' && page === 1;
  const { data, isFetching, isLoading } = useCustomersPage({ search, state: stateFilter, sort, page, pageSize: PAGE_SIZE }, isDefaultParams ? initialData : undefined);
  const pageItems = (data?.items ?? []) as Customer[];
  const total = data?.total ?? 0;

  const selected = pageItems.find((c) => c.id === selectedId) ?? null;
  const deleteTarget = pageItems.find((c) => c.id === deleteTargetId) ?? null;

  function viewRow(id: string) {
    setSelectedId(id);
    setViewOpen(true);
  }

  function editRow(id: string) {
    setSelectedId(id);
    setEditOpen(true);
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    try {
      await deleteCustomer.mutateAsync(deleteTargetId);
      toast.success('Customer removed');
      if (selectedId === deleteTargetId) {
        setSelectedId(null);
        setViewOpen(false);
        setEditOpen(false);
      }
      setDeleteTargetId(null);
    } catch (e: any) {
      toast.error(e.message);
    }
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

      <div className="mb-3 flex flex-wrap gap-2">
        <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name or phone…" className="flex-1 sm:max-w-xs" />
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="h-8 w-[160px] text-[11.5px]">
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
          <SelectTrigger className="h-8 w-[160px] text-[11.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="billed-desc">Billed: high-low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className={`rounded-xl2 border border-line bg-surface shadow-card transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
        {isLoading ? (
          <SkeletonTable cols={5} />
        ) : total === 0 ? (
          <div className="p-10 text-center text-[13px] text-ink-faint">No customers match your filters.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Shop / State</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead className="text-right">&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => viewRow(c.id)}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 text-[11px] font-extrabold text-white"
                        style={{ background: hashColor(c.name) }}
                      >
                        {initials(c.name)}
                      </span>
                      <span className="min-w-0">
                        <div className="truncate text-[13px] font-bold text-ink">
                          {c.name}
                          {c.guest && <span className="ml-1.5 rounded-sm2 bg-surface-alt px-1.5 py-0.5 text-[9px] font-bold text-ink-faint">Guest</span>}
                        </div>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-ink-soft">{c.shopName ? `${c.shopName} · ${c.state}` : c.state}</TableCell>
                  <TableCell className="font-mono text-ink-soft">{c.gstin ?? '—'}</TableCell>
                  <TableCell className="text-ink-soft">{c.phone ?? '—'}</TableCell>
                  <TableCell className="text-ink-soft">{c.terms}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="View customer"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          viewRow(c.id);
                        }}
                      >
                        <Eye size={14} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Edit customer"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          editRow(c.id);
                        }}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Delete customer"
                        className="h-8 w-8 hover:bg-brand-light hover:text-brand-dark"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetId(c.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>

      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent>
          {selected && (
            <CustomerDetail
              key={selected.id}
              customer={selected}
              onEdit={() => {
                setViewOpen(false);
                setEditOpen(true);
              }}
              onDeleteClick={() => setDeleteTargetId(selected.id)}
            />
          )}
        </SheetContent>
      </Sheet>

      <CustomerFormDialog open={addOpen} onOpenChange={setAddOpen} mode="create" onSaved={(c) => viewRow(c.id)} />
      {selected && <CustomerFormDialog key={selected.id} open={editOpen} onOpenChange={setEditOpen} mode="edit" customer={selected} onSaved={() => setViewOpen(true)} />}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="Remove customer"
        description={
          <>
            Remove <b className="font-bold text-ink">{deleteTarget?.name}</b>? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete customer"
        pending={deleteCustomer.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function CustomerDetail({ customer, onEdit, onDeleteClick }: { customer: Customer; onEdit: () => void; onDeleteClick: () => void }) {
  const { data: ledger } = useCustomerLedger(customer.id);

  return (
    <>
      <SheetHeader>
        <SheetIcon>
          <Users size={16} />
        </SheetIcon>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px] font-extrabold text-ink">
            {customer.name}
            {customer.guest && <span className="rounded-sm2 bg-surface-alt px-1.5 py-0.5 text-[9px] font-bold text-ink-faint">Guest</span>}
          </div>
          <div className="truncate text-[11.5px] text-ink-faint">{customer.shopName ?? 'Customer details'}</div>
        </div>
      </SheetHeader>

      <SheetBody>
        <div className="mb-4 flex items-center gap-3 border-b border-line pb-4">
          <span
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-sm2 text-[14px] font-extrabold text-white"
            style={{ background: hashColor(customer.name) }}
          >
            {initials(customer.name)}
          </span>
          <div>
            <p className="text-[12px] text-ink-soft">
              {customer.state} {customer.gstin ? `· GSTIN ${customer.gstin}` : '· Unregistered'}
            </p>
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
          {customer.altPhone && (
            <div className="flex justify-between">
              <span className="text-ink-faint">Alternative phone</span>
              <span className="font-semibold text-ink-body">{customer.altPhone}</span>
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
      </SheetBody>

      <SheetFooter>
        <Button type="button" variant="outline" size="sm" onClick={onDeleteClick} className="border-red-soft text-red hover:bg-red-soft">
          <Trash2 size={13} /> Delete
        </Button>
        <Button type="button" onClick={onEdit}>
          <Pencil size={13} /> Edit
        </Button>
      </SheetFooter>
    </>
  );
}

function LedgerStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md2 bg-bg p-2.5 text-center">
      <div className={`font-mono text-[14px] font-extrabold ${warn ? 'text-red' : 'text-ink'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
