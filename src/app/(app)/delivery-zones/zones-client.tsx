'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AffixInput } from '@/components/ui/form-sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCurrentUser } from '@/components/current-user';
import { deleteZone, listZones, saveZone, type ZoneRow } from '@/actions/storefront';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

export function ZonesClient({ initial }: { initial: ZoneRow[] }) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { data: zones = initial } = useQuery({ queryKey: ['zones'], queryFn: () => listZones(), initialData: initial });
  const [editing, setEditing] = useState<ZoneRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ZoneRow | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['zones'] });

  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
            <MapPin size={18} className="text-brand" /> Delivery zones
          </h1>
          <p className="mt-1 max-w-[70ch] text-[12px] text-ink-faint">Where the web store delivers, by PIN code, and what delivery costs there. With no zones, the store accepts any PIN code and charges no delivery.</p>
        </div>
        {me.isOwner && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={13} /> New zone
          </Button>
        )}
      </div>

      {zones.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-line bg-surface px-6 py-14 text-center text-ink-faint shadow-card">
          <MapPin size={28} />
          <p className="text-[13.5px] font-bold text-ink-soft">No delivery zones yet.</p>
          <p className="max-w-[48ch] text-[12px]">Example: “City” with your nearby PIN codes and ₹50 delivery, free over ₹2,500.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl2 border border-line bg-surface shadow-card">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2.5">Zone</th>
                <th className="px-2.5 py-2.5">PIN codes</th>
                <th className="px-2.5 py-2.5 text-right">Delivery</th>
                <th className="px-2.5 py-2.5 text-right">Min order</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {zones.map((z) => (
                <tr key={z.id} className={cn(!z.active && 'opacity-60')}>
                  <td className="px-4 py-3">
                    <div className="font-bold text-ink">{z.name}</div>
                    {!z.active && <div className="text-[11px] text-ink-faint">Off</div>}
                  </td>
                  <td className="max-w-[320px] px-2.5 py-3">
                    <div className="truncate font-mono text-[12px] text-ink-soft">{z.pincodes.join(', ')}</div>
                    <div className="text-[11px] text-ink-faint">{z.pincodes.length} PIN code{z.pincodes.length === 1 ? '' : 's'}</div>
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-3 text-right">
                    <div className="font-mono text-ink">{z.charge ? fmtInr(z.charge) : 'Free'}</div>
                    {z.freeAbove != null && z.charge > 0 && <div className="text-[11px] text-ink-faint">free over {fmtInr(z.freeAbove)}</div>}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-3 text-right font-mono text-ink-soft">{z.minOrder ? fmtInr(z.minOrder) : '—'}</td>
                  <td className="px-4 py-3">
                    {me.isOwner && (
                      <div className="flex justify-end">
                        <button onClick={() => setEditing(z)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-surface-alt hover:text-ink" aria-label={`Edit ${z.name}`}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDeleting(z)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-brand-light hover:text-brand" aria-label={`Delete ${z.name}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ZoneDialog target={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="The store stops delivering to its PIN codes unless another zone covers them."
        confirmLabel="Delete zone"
        onConfirm={async () => {
          if (!deleting) return;
          const r = await deleteZone(deleting.id);
          if (r.error) toast.error(r.error);
          else toast.success(`${deleting.name} deleted`);
          setDeleting(null);
          refresh();
        }}
      />
    </div>
  );
}

function ZoneDialog({ target, onClose, onSaved }: { target: ZoneRow | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const z = target && target !== 'new' ? target : null;
  const [key, setKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [pins, setPins] = useState('');
  const [charge, setCharge] = useState('');
  const [freeAbove, setFreeAbove] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const k = target === null ? null : z?.id ?? 'new';
  if (k !== key) {
    setKey(k);
    setName(z?.name ?? '');
    setPins(z?.pincodes.join(', ') ?? '');
    setCharge(z ? String(z.charge) : '');
    setFreeAbove(z?.freeAbove != null ? String(z.freeAbove) : '');
    setMinOrder(z?.minOrder ? String(z.minOrder) : '');
    setActive(z?.active ?? true);
  }
  const count = new Set(pins.split(/[\s,;]+/).filter((t) => /^\d{6}$/.test(t))).size;
  async function save() {
    setBusy(true);
    const r = await saveZone(z?.id ?? null, { name, pincodes: pins, charge: Number(charge) || 0, freeAbove: freeAbove ? Number(freeAbove) : null, minOrder: Number(minOrder) || 0, active });
    setBusy(false);
    if (r.error) return toast.error(r.error);
    toast.success(z ? 'Zone saved' : `Added ${name}`);
    onSaved();
    onClose();
  }
  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{z ? `Edit ${z.name}` : 'New delivery zone'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="City" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 flex justify-between text-[11.5px] font-semibold text-ink-body">
              PIN codes <span className="font-normal text-ink-faint">{count} found</span>
            </span>
            <Textarea value={pins} onChange={(e) => setPins(e.target.value)} rows={3} className="font-mono text-[12.5px]" placeholder="641001, 641002, 641004" />
            <span className="mt-1 block text-[11px] text-ink-faint">Separate with commas, spaces or new lines.</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Delivery charge</span>
              <AffixInput before="₹" value={charge} onChange={(e) => setCharge(e.target.value)} inputMode="decimal" placeholder="0" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Free over</span>
              <AffixInput before="₹" value={freeAbove} onChange={(e) => setFreeAbove(e.target.value)} inputMode="decimal" placeholder="Never" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Minimum order</span>
              <AffixInput before="₹" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} inputMode="decimal" placeholder="0" />
            </label>
          </div>
          <label className="flex items-center justify-between gap-3 text-[13px] font-semibold text-ink">
            Zone is on
            <Switch checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="Zone is on" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim() || count === 0}>
            {z ? 'Save zone' : 'Create zone'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
