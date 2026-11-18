'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2, Pencil, Users, Receipt, Eye, MoreHorizontal, Power, ImagePlus, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';
import { ZoomableImage } from '@/components/ui/image-lightbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmtInr } from '@/lib/gst';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCustomersPage, useCustomerStates, useCustomerLedger, useToggleCustomerActive, type CustomersPageData } from '@/hooks/use-customers';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { DeleteCustomerDialog } from '@/components/customers/delete-customer-dialog';
import { CustomerSpecialPrices } from '@/components/customers/customer-special-prices';
import { StatementButton } from '@/components/customers/statement-button';
import { useCurrentUser } from '@/components/current-user';
import { initials, hashColor } from '@/lib/avatar';
import { customerDisplayName } from '@/lib/customer';
import type { CustomerSort, CustomerStatus } from '@/actions/customers';

const PAGE_SIZE = 10;
const MAX_PHOTOS = 6;

type Customer = {
  id: string;
  name: string;
  shopName: string | null;
  contact: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  state: string;
  district?: string | null;
  gstin: string | null;
  address: string | null;
  terms: string;
  creditLimit: string | number;
  guest: boolean;
  fssaiNo?: string | null;
  pincode?: string | null;
  active: boolean;
  images: string[];
  route: string | null;
  updatedAt?: string;
  /** From the list query / ledger — decides which delete dialog opens. */
  invoiceCount?: number;
};

const STATUS_CHIPS: { value: CustomerStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'all', label: 'All' },
];

export function CustomersClient({ initialData }: { initialData: CustomersPageData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [stateFilter, setStateFilter] = useState('all');
  const [sort, setSort] = useState<CustomerSort>('name');
  const [status, setStatus] = useState<CustomerStatus>('active');
  const [showGuests, setShowGuests] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Customer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const toggleActive = useToggleCustomerActive();

  useEffect(() => setPage(1), [search, stateFilter, sort, status, showGuests]);

  // Arriving from a link like the Activity log's `/customers?open=<id>` —
  // open that customer's sheet straight away. The sheet reads the customer
  // from its ledger query, so it works even when they're on another page
  // of the list or disabled.
  useEffect(() => {
    const id = searchParams.get('open');
    if (!id) return;
    setSelectedId(id);
    setViewOpen(true);
    router.replace('/customers');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: states } = useCustomerStates();
  const isDefaultParams = search === '' && stateFilter === 'all' && sort === 'name' && status === 'active' && !showGuests && page === 1;
  const { data, isFetching, isLoading } = useCustomersPage(
    { search, state: stateFilter, sort, status, includeGuests: showGuests, page, pageSize: PAGE_SIZE },
    isDefaultParams ? initialData : undefined
  );
  const pageItems = (data?.items ?? []) as Customer[];
  const total = data?.total ?? 0;
  const counts = data?.counts;

  // The open customer: its ledger query's row once loaded (always fresh),
  // else the list row, else the copy taken on click — a row can leave the
  // current page (disabled under the Active chip) while its sheet is open.
  const { data: ledger, isError: ledgerFailed } = useCustomerLedger(selectedId);
  const base = pageItems.find((c) => c.id === selectedId) ?? (snapshot?.id === selectedId ? snapshot : null);
  const fresh = ledger?.customer as Customer | undefined;
  const selected: Customer | null =
    selectedId && (base || fresh) ? ({ ...base, ...fresh, invoiceCount: ledger?.invoiceCount ?? base?.invoiceCount } as Customer) : null;

  // A linked customer that no longer exists — say so instead of an empty sheet.
  useEffect(() => {
    if (!ledgerFailed || base) return;
    toast.error('That customer could not be found. They may have been deleted.');
    setViewOpen(false);
    setSelectedId(null);
  }, [ledgerFailed, base]);

  function openView(c: Customer) {
    setSnapshot(c);
    setSelectedId(c.id);
    setViewOpen(true);
  }

  function openEdit(c: Customer) {
    setSnapshot(c);
    setSelectedId(c.id);
    setEditOpen(true);
  }

  async function setActive(c: Customer, active: boolean) {
    const name = customerDisplayName(c);
    try {
      await toggleActive.mutateAsync({ id: c.id, active });
      toast.success(active ? `${name} enabled` : `${name} disabled. They won't show in Bill To.`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const filtered = search !== '' || stateFilter !== 'all';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] sm:text-[17px] font-extrabold text-ink">
            <Users size={18} className="text-brand" /> Customers
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">
            {counts && !filtered ? `${counts.all} customers · ${counts.active} active` : 'Tap a customer for their photos, prices and billing history.'}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={13} /> Add customer
        </Button>
      </div>

      <div className="mb-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name, shop, phone or route…" className="flex-1 sm:max-w-xs" />
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
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Customer status" className="flex flex-wrap gap-1.5">
            {STATUS_CHIPS.map((chip) => (
              <Button
                key={chip.value}
                type="button"
                size="sm"
                variant={status === chip.value ? 'default' : 'outline'}
                aria-pressed={status === chip.value}
                onClick={() => setStatus(chip.value)}
              >
                {chip.label}
                {counts && <span className="font-mono text-[11px] opacity-80">{counts[chip.value]}</span>}
              </Button>
            ))}
          </div>
          <span className="ml-auto flex items-center gap-2">
            <Switch id="show-guests" checked={showGuests} onChange={(e) => setShowGuests(e.target.checked)} />
            <label htmlFor="show-guests" className="cursor-pointer text-[11.5px] font-semibold text-ink-soft">
              Show guests
            </label>
          </span>
        </div>
      </div>

      <div className={`rounded-xl2 border border-line bg-surface shadow-card transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
        {isLoading ? (
          <SkeletonTable cols={4} />
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <Users size={30} className="text-ink-faint" />
            <p className="text-[13px] font-bold text-ink-soft">{status === 'disabled' && !filtered ? 'No disabled customers.' : 'No customers match your filters.'}</p>
            {status !== 'disabled' && !filtered && (
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={13} /> Add a customer
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">Route</TableHead>
                <TableHead className="hidden lg:table-cell">State</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((c) => {
                const secondary = c.shopName ? c.name : c.contact;
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => openView(c)}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <CustomerAvatar customer={c} />
                        <span className="min-w-0">
                          <span className={`flex items-center gap-1.5 text-[13px] font-bold ${c.active ? 'text-ink' : 'text-ink-faint'}`}>
                            <span className="truncate">{customerDisplayName(c)}</span>
                            {c.guest && <Tag>Guest</Tag>}
                            {!c.active && <Tag>Disabled</Tag>}
                            {c.images.length > 1 && (
                              <span className="hidden flex-shrink-0 items-center gap-0.5 text-[10px] font-bold text-ink-faint md:inline-flex" title={`${c.images.length} photos`}>
                                <Camera size={10} /> {c.images.length}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[10.5px] text-ink-faint">
                            {secondary}
                            {c.phone && (
                              <span className="sm:hidden">
                                {secondary ? ' · ' : ''}
                                {c.phone}
                              </span>
                            )}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-ink-soft sm:table-cell">{c.phone ?? '—'}</TableCell>
                    <TableCell className="hidden text-ink-soft md:table-cell">{c.route ?? '—'}</TableCell>
                    <TableCell className="hidden text-ink-soft lg:table-cell">{c.state}</TableCell>
                    {/* Stops row clicks — the menu's portal still bubbles through here in React's tree. */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Actions for ${customerDisplayName(c)}`}>
                            <MoreHorizontal size={15} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => openView(c)}>
                            <Eye size={13} /> View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openEdit(c)}>
                            <Pencil size={13} /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setActive(c, !c.active)}>
                            <Power size={13} /> {c.active ? 'Disable' : 'Enable'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setDeleteTarget(c)} className="text-red focus:bg-red-soft focus:text-red">
                            <Trash2 size={13} /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>

      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent>
          {!selected && (
            <SheetBody>
              <SheetTitle className="sr-only">Loading customer</SheetTitle>
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="mt-4 h-24 w-full" />
              <Skeleton className="mt-4 h-40 w-full" />
            </SheetBody>
          )}
          {selected && (
            <CustomerDetail
              key={selected.id}
              customer={selected}
              ledger={ledger}
              toggling={toggleActive.isPending}
              onToggleActive={(active) => setActive(selected, active)}
              onEdit={() => {
                setViewOpen(false);
                setEditOpen(true);
              }}
              onDeleteClick={() => setDeleteTarget(selected)}
            />
          )}
        </SheetContent>
      </Sheet>

      <CustomerFormDialog open={addOpen} onOpenChange={setAddOpen} mode="create" addAnother onSaved={(c) => openView({ ...(c as Customer), invoiceCount: 0 })} />
      {selected && (
        // Keyed by updatedAt so the form re-reads the customer after any
        // change made elsewhere (e.g. the Active switch in the detail sheet)
        // instead of saving back the value it was first mounted with.
        <CustomerFormDialog
          key={`${selected.id}-${selected.updatedAt ?? ''}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          customer={selected}
          onSaved={() => setViewOpen(true)}
        />
      )}

      <DeleteCustomerDialog
        customer={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={(id) => {
          if (id === selectedId) {
            setViewOpen(false);
            setEditOpen(false);
            setSelectedId(null);
          }
        }}
      />
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="flex-shrink-0 rounded-sm2 bg-surface-alt px-1.5 py-0.5 text-[9px] font-bold text-ink-faint">{children}</span>;
}

/** First photo when there is one (a shop front is easier to recognise than
 * initials), otherwise coloured initials. Faded for disabled customers. */
function CustomerAvatar({ customer, large }: { customer: Pick<Customer, 'name' | 'shopName' | 'images' | 'active'>; large?: boolean }) {
  const name = customerDisplayName(customer);
  const size = large ? 'h-[34px] w-[34px] text-[12px]' : 'h-8 w-8 text-[11px]';
  const faded = customer.active ? '' : 'opacity-50';
  if (customer.images[0]) {
    return (
      <span className={`block flex-shrink-0 overflow-hidden rounded-sm2 bg-surface-alt ${size} ${faded}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={customer.images[0]} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className={`flex flex-shrink-0 items-center justify-center rounded-sm2 font-extrabold text-white ${size} ${faded}`} style={{ background: hashColor(name) }}>
      {initials(name)}
    </span>
  );
}

function CustomerDetail({
  customer,
  ledger,
  toggling,
  onToggleActive,
  onEdit,
  onDeleteClick,
}: {
  customer: Customer;
  ledger: any;
  toggling: boolean;
  onToggleActive: (active: boolean) => void;
  onEdit: () => void;
  onDeleteClick: () => void;
}) {
  const name = customerDisplayName(customer);
  const { isOwner } = useCurrentUser();
  const photos = customer.images ?? [];
  const lastInvoice = ledger?.invoices?.[0];
  const where = [customer.district, customer.state].filter(Boolean).join(', ');

  return (
    <>
      <SheetHeader>
        <CustomerAvatar customer={customer} large />
        <div className="min-w-0 flex-1">
          <SheetTitle className="flex items-center gap-1.5">
            <span className="truncate">{name}</span>
            {customer.guest && <Tag>Guest</Tag>}
            {!customer.active && <Tag>Disabled</Tag>}
          </SheetTitle>
          <div className="truncate text-[11.5px] text-ink-faint">{[customer.shopName ? customer.name : customer.contact, where].filter(Boolean).join(' · ')}</div>
        </div>
      </SheetHeader>

      <SheetBody>
        <div className="mb-4 flex items-center gap-3 rounded-lg2 bg-surface-alt px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-ink">{customer.active ? 'Active' : 'Disabled'}</div>
            <div className="text-[11.5px] text-ink-soft">
              {customer.active ? 'Shows in Bill To when creating invoices' : 'Hidden from Bill To. Old invoices and payments are kept.'}
            </div>
          </div>
          <Switch checked={customer.active} disabled={toggling} onChange={(e) => onToggleActive(e.target.checked)} aria-label="Customer active" />
        </div>

        {ledger && (
          <div className="mb-4 grid grid-cols-3 gap-2.5">
            <LedgerStat label="Invoices" value={String(ledger.invoiceCount)} />
            <LedgerStat label="Total billed" value={fmtInr(ledger.totalBilled)} />
            <LedgerStat label="Outstanding" value={fmtInr(ledger.outstanding)} warn={ledger.outstanding > 0} />
          </div>
        )}

        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">
              Photos · {photos.length} of {MAX_PHOTOS}
            </span>
            {photos.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
                <ImagePlus size={13} /> {photos.length < MAX_PHOTOS ? 'Add' : 'Manage'}
              </Button>
            )}
          </div>
          {photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url) => (
                <span key={url} className="block aspect-square overflow-hidden rounded-md2 border border-line">
                  <ZoomableImage src={url} alt={name} gallery={photos} />
                </span>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              className="flex w-full items-center justify-center gap-1.5 rounded-md2 border border-dashed border-line py-4 text-[12px] font-bold text-ink-faint transition-colors hover:border-brand hover:text-brand"
            >
              <ImagePlus size={14} /> Add shop or freezer photos
            </button>
          )}
        </section>

        <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-2.5 gap-y-2 rounded-lg2 border border-dashed border-line p-3.5 text-[12.5px]">
          {customer.contact && <Detail label="Contact person">{customer.contact}</Detail>}
          {customer.phone && (
            <Detail label="Phone">
              <a href={`tel:${customer.phone}`} className="font-mono hover:text-brand">
                {customer.phone}
              </a>
            </Detail>
          )}
          {customer.altPhone && (
            <Detail label="Alternative phone">
              <a href={`tel:${customer.altPhone}`} className="font-mono hover:text-brand">
                {customer.altPhone}
              </a>
            </Detail>
          )}
          {customer.email && <Detail label="Email">{customer.email}</Detail>}
          {customer.address && <Detail label="Address">{[customer.address, customer.pincode].filter(Boolean).join(' – ')}</Detail>}
          {customer.route && <Detail label="Route">{customer.route}</Detail>}
          <Detail label="GST">{customer.gstin ? <span className="font-mono">{customer.gstin}</span> : `Unregistered · ${customer.state}`}</Detail>
          {customer.fssaiNo && <Detail label="FSSAI No.">{customer.fssaiNo}</Detail>}
          <Detail label="Payment terms">{customer.terms}</Detail>
          <Detail label="Credit limit">
            <span className="font-mono">{fmtInr(Number(customer.creditLimit))}</span>
          </Detail>
          {lastInvoice && <Detail label="Last invoice">{new Date(lastInvoice.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Detail>}
        </dl>

        <CustomerSpecialPrices customerId={customer.id} />

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
                      <td className="p-2.5 text-right font-mono font-bold">
                        {fmtInr(inv.computedTotal)}
                        {inv.balanceDue > 0.005 && <div className="text-[10.5px] font-semibold text-red">{fmtInr(inv.balanceDue)} due</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SheetBody>

      <SheetFooter>
        <div className="flex flex-wrap gap-2">
          {isOwner && (
            <Button type="button" variant="outline" size="sm" onClick={onDeleteClick} className="border-red-soft text-red hover:bg-red-soft">
              <Trash2 size={13} /> Delete
            </Button>
          )}
          {!customer.guest && <StatementButton customerId={customer.id} name={name} />}
        </div>
        <Button type="button" onClick={onEdit}>
          <Pencil size={13} /> Edit
        </Button>
      </SheetFooter>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 font-semibold text-ink-body [overflow-wrap:anywhere]">{children}</dd>
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
