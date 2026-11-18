'use client';

import { useState } from 'react';
import { Ban, CheckCircle2, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentUser } from '@/components/current-user';
import { SoftBadge } from '@/components/inventory/stock-badges';
import { PurchasesNav } from '@/components/purchases/purchases-nav';
import { SupplierFormDialog } from '@/components/purchases/supplier-form-dialog';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDeleteSupplier, useSetSupplierActive, useSuppliers } from '@/hooks/use-suppliers';
import type { SupplierRow } from '@/actions/suppliers';

export function SuppliersClient({ initialData, companyState, currency }: { initialData: SupplierRow[]; companyState: string; currency: string }) {
  const { isOwner } = useCurrentUser();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierRow | null>(null);
  // Set when a delete is refused because the supplier has bills — the same
  // dialog then offers Disable instead.
  const [blocked, setBlocked] = useState<string | null>(null);
  const del = useDeleteSupplier();
  const setActive = useSetSupplierActive();

  const isSeed = search === '' && !includeInactive;
  const { data: suppliers = [], isLoading, isFetching } = useSuppliers({ search, includeInactive }, isSeed ? initialData : undefined);

  function openForm(s: SupplierRow | null) {
    setEditing(s);
    setFormOpen(true);
  }

  async function toggleActive(s: SupplierRow, active: boolean) {
    try {
      await setActive.mutateAsync({ id: s.id, active });
      toast.success(active ? `${s.name} enabled` : `${s.name} disabled`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (blocked) {
      await toggleActive(deleteTarget, false);
      closeDelete();
      return;
    }
    const res = await del.mutateAsync(deleteTarget.id);
    if (res.error && res.canDisable) return setBlocked(res.error);
    if (res.error) toast.error(res.error);
    else toast.success(`Deleted ${deleteTarget.name}`);
    closeDelete();
  }

  function closeDelete() {
    setDeleteTarget(null);
    setBlocked(null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] sm:text-[17px] font-extrabold text-ink">
            <Truck size={18} className="text-brand" /> Suppliers
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">The companies you buy stock from.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PurchasesNav />
          <Button onClick={() => openForm(null)}>
            <Plus size={13} /> Add supplier
          </Button>
        </div>
      </div>

      <div className={cn('mb-4 flex flex-wrap items-center gap-3 rounded-xl2 border border-line bg-surface p-3.5 shadow-card transition-opacity', isFetching && 'opacity-70')}>
        <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name, phone or GSTIN…" className="h-8 max-w-[280px] text-[12.5px]" />
        <label className="ml-auto flex items-center gap-2 text-[11.5px] font-semibold text-ink-soft">
          Show disabled
          <Switch checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
        </label>
      </div>

      {isLoading ? (
        <SkeletonTable cols={5} />
      ) : suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-line bg-surface py-14 text-center text-ink-faint shadow-card">
          <Truck size={32} />
          <p className="text-[13.5px] font-bold text-ink-soft">{search ? 'No suppliers match.' : 'No suppliers yet.'}</p>
          {!search && (
            <Button size="sm" onClick={() => openForm(null)}>
              <Plus size={13} /> Add your first supplier
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden shadow-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Bought</TableHead>
                  <TableHead className="text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id} className={cn(!s.active && 'opacity-60')}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-bold text-ink">{s.name}</span>
                        {!s.active && <SoftBadge className="bg-surface-alt text-ink-soft">Disabled</SoftBadge>}
                      </div>
                      {s.contact && <div className="truncate text-[11px] text-ink-faint">{s.contact}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-ink-soft">{s.phone || '—'}</TableCell>
                    <TableCell className="font-mono text-[12px] text-ink-soft">{s.gstin || '—'}</TableCell>
                    <TableCell className="text-ink-soft">{s.state || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-mono font-bold text-ink">{fmtInr(s.purchaseTotal, currency)}</div>
                      <div className="text-[11px] text-ink-faint">
                        {s.purchaseCount} bill{s.purchaseCount === 1 ? '' : 's'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions s={s} isOwner={isOwner} onEdit={() => openForm(s)} onToggle={(a) => toggleActive(s, a)} onDelete={() => setDeleteTarget(s)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-2.5 md:hidden">
            {suppliers.map((s) => (
              <div key={s.id} className={cn('rounded-xl2 border border-line bg-surface p-3 shadow-card', !s.active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-ink">{s.name}</div>
                    <div className="truncate text-[11px] text-ink-faint">{[s.phone, s.state, s.gstin].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[12.5px] font-bold text-ink">{fmtInr(s.purchaseTotal, currency)}</div>
                    <div className="text-[11px] text-ink-faint">
                      {s.purchaseCount} bill{s.purchaseCount === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <RowActions s={s} isOwner={isOwner} onEdit={() => openForm(s)} onToggle={(a) => toggleActive(s, a)} onDelete={() => setDeleteTarget(s)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} defaultState={companyState} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && closeDelete()}
        title={blocked ? 'Can’t delete this supplier' : 'Delete supplier'}
        description={
          blocked ?? (
            <>
              Delete <b className="font-bold text-ink">{deleteTarget?.name}</b>? This can&apos;t be undone.
            </>
          )
        }
        destructive={!blocked}
        icon={blocked ? Ban : undefined}
        confirmLabel={blocked ? 'Disable supplier' : 'Delete supplier'}
        pending={del.isPending || setActive.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function RowActions({
  s,
  isOwner,
  onEdit,
  onToggle,
  onDelete,
}: {
  s: SupplierRow;
  isOwner: boolean;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${s.name}`} onClick={onEdit}>
        <Pencil size={14} />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onToggle(!s.active)}>
        {s.active ? <Ban size={13} /> : <CheckCircle2 size={13} />} {s.active ? 'Disable' : 'Enable'}
      </Button>
      {isOwner && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 hover:bg-red-soft hover:text-red"
          aria-label={`Delete ${s.name}`}
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </Button>
      )}
    </div>
  );
}
