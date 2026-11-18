'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCurrentUser } from '@/components/current-user';
import { deleteCustomerGroup, listCustomerGroups, listGroupMembers, saveCustomerGroup, setCustomersGroup, type CustomerGroupRow } from '@/actions/customer-groups';
import { unwrap } from '@/lib/action-result';
import { cn } from '@/lib/utils';

const COLORS: Record<string, string> = {
  slate: 'bg-surface-alt text-ink-soft',
  blue: 'bg-[hsl(211_70%_94%)] text-[hsl(211_61%_36%)] dark:bg-[hsl(211_40%_18%)] dark:text-[hsl(211_70%_72%)]',
  green: 'bg-green-soft text-green',
  gold: 'bg-gold-soft text-ink-body',
  violet: 'bg-[hsl(262_60%_95%)] text-[hsl(262_45%_42%)] dark:bg-[hsl(262_30%_20%)] dark:text-[hsl(262_70%_78%)]',
  brand: 'bg-brand-light text-brand-dark',
};

export function CustomerGroupsClient({ initial }: { initial: CustomerGroupRow[] }) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { data: groups = initial } = useQuery({ queryKey: ['customer-groups'], queryFn: () => listCustomerGroups(), initialData: initial });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['customer-groups'] }), qc.invalidateQueries({ queryKey: ['customers'] })]);
  const [editing, setEditing] = useState<CustomerGroupRow | 'new' | null>(null);
  const [members, setMembers] = useState<CustomerGroupRow | null>(null);
  const [deleting, setDeleting] = useState<CustomerGroupRow | null>(null);
  const del = useMutation({ mutationFn: async (id: string) => unwrap(await deleteCustomerGroup(id)), onSuccess: refresh });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
            <UsersRound size={18} className="text-brand" /> Customer groups
          </h1>
          <p className="mt-1 max-w-[70ch] text-[12px] text-ink-faint">Group customers, such as Retail, Wholesale and Distributor, to limit coupons and discounts to a group.</p>
        </div>
        {me.isOwner && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={13} /> New group
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-line bg-surface px-6 py-14 text-center text-ink-faint shadow-card">
          <UsersRound size={28} />
          <p className="text-[13.5px] font-bold text-ink-soft">No groups yet.</p>
          <p className="max-w-[44ch] text-[12px]">Start with the ways you already price: Retail, Wholesale, Distributor.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <section key={g.id} className="flex flex-col gap-3 rounded-xl2 border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className={cn('inline-block rounded-sm2 px-2 py-0.5 text-[12px] font-bold', COLORS[g.color] ?? COLORS.slate)}>{g.name}</span>
                  {g.description && <p className="mt-1.5 text-[12px] text-ink-soft">{g.description}</p>}
                </div>
                {me.isOwner && (
                  <div className="flex">
                    <button onClick={() => setEditing(g)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-surface-alt hover:text-ink" aria-label={`Edit ${g.name}`}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setDeleting(g)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-brand-light hover:text-brand" aria-label={`Delete ${g.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-auto flex items-center justify-between">
                <span className="text-[12.5px] text-ink-soft">
                  <b className="tabular-nums text-ink">{g.customerCount}</b> customer{g.customerCount === 1 ? '' : 's'}
                </span>
                <Button size="sm" variant="outline" onClick={() => setMembers(g)}>
                  Manage customers
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}

      <GroupDialog target={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <MembersDialog group={members} onClose={() => setMembers(null)} onSaved={refresh} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Its customers stay, just without a group. Coupons limited to this group lose that limit."
        confirmLabel="Delete group"
        pending={del.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast.success(`${deleting.name} deleted`);
          } catch (e) {
            toast.error((e as Error).message);
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}

function GroupDialog({ target, onClose, onSaved }: { target: CustomerGroupRow | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const g = target && target !== 'new' ? target : null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('slate');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const k = target === null ? null : g?.id ?? 'new';
  if (k !== key) {
    setKey(k);
    setName(g?.name ?? '');
    setDescription(g?.description ?? '');
    setColor(g?.color ?? 'slate');
  }
  async function save() {
    setBusy(true);
    const r = await saveCustomerGroup(g?.id ?? null, { name, description, color: color as 'slate' });
    setBusy(false);
    if (r.error) return toast.error(r.error);
    toast.success(g ? 'Group saved' : `Added ${name}`);
    onSaved();
    onClose();
  }
  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{g ? `Edit ${g.name}` : 'New customer group'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Wholesale" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Description (optional)</span>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={200} />
          </label>
          <div>
            <span className="mb-1.5 block text-[11.5px] font-semibold text-ink-body">Colour</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(COLORS).map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} aria-pressed={color === c} className={cn('h-8 rounded-sm2 px-3 text-[12px] font-bold capitalize ring-offset-2 ring-offset-surface', COLORS[c], color === c && 'ring-2 ring-ink')}>
                  {name || c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {g ? 'Save' : 'Create group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({ group, onClose, onSaved }: { group: CustomerGroupRow | null; onClose: () => void; onSaved: () => void }) {
  const { data: customers = [], isLoading } = useQuery({ queryKey: ['customers', 'group-members'], queryFn: () => listGroupMembers(), enabled: !!group });
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const initial = useMemo(() => new Set(customers.filter((c) => c.groupId === group?.id).map((c) => c.id)), [customers, group?.id]);
  const current = picked ?? initial;
  const q = search.trim().toLowerCase();
  const shown = customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.shopName ?? '').toLowerCase().includes(q) || (c.phone ?? '').includes(q)).slice(0, 300);

  function close() {
    setPicked(null);
    setSearch('');
    onClose();
  }
  async function save() {
    if (!group) return;
    const added = Array.from(current).filter((id) => !initial.has(id));
    const removed = Array.from(initial).filter((id) => !current.has(id));
    setBusy(true);
    try {
      if (added.length) unwrap(await setCustomersGroup(added, group.id));
      if (removed.length) unwrap(await setCustomersGroup(removed, null));
      toast.success(`${group.name}: ${current.size} customer${current.size === 1 ? '' : 's'}`);
      onSaved();
      close();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <Dialog open={group !== null} onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Customers in {group?.name}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers" className="pl-8" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-md2 border border-line">
          {isLoading ? (
            <p className="p-4 text-[12.5px] text-ink-faint">Loading customers…</p>
          ) : shown.length === 0 ? (
            <p className="p-4 text-[12.5px] text-ink-faint">No customers match.</p>
          ) : (
            shown.map((c) => {
              const on = current.has(c.id);
              const elsewhere = !on && c.groupId && c.groupId !== group?.id;
              return (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-0 hover:bg-bg">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      setPicked(next);
                    }}
                    className="accent-[hsl(var(--brand))]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{c.shopName || c.name}</span>
                    <span className="block truncate text-[11px] text-ink-faint">{[c.shopName ? c.name : null, c.phone].filter(Boolean).join(' · ') || ' '}</span>
                  </span>
                  {elsewhere && <span className="text-[10.5px] text-ink-faint">in another group</span>}
                </label>
              );
            })
          )}
        </div>
        <p className="text-[11.5px] text-ink-faint">A customer is in one group at a time; ticking one here moves them.</p>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
