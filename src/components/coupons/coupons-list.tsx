'use client';

import { useMemo, useState } from 'react';
import { BadgePercent, Copy, Pencil, Plus, TicketPercent, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CouponFormSheet } from '@/components/coupons/coupon-form-sheet';
import { useCurrentUser } from '@/components/current-user';
import { useCoupons, useDeleteCoupon, useSetCouponActive } from '@/hooks/use-coupons';
import type { CouponRow, CouponState } from '@/actions/coupons';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

const STATE_META: Record<CouponState, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-soft text-green' },
  scheduled: { label: 'Scheduled', className: 'bg-gold-soft text-ink-body' },
  expired: { label: 'Expired', className: 'bg-surface-alt text-ink-soft' },
  off: { label: 'Off', className: 'bg-surface-alt text-ink-soft' },
};

const TABS: { key: CouponState | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'expired', label: 'Expired' },
  { key: 'off', label: 'Off' },
];

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : null);

export function offerText(c: Pick<CouponRow, 'kind' | 'value' | 'maxDiscount'>): string {
  if (c.kind === 'PERCENT') return `${c.value}% off${c.maxDiscount ? ` up to ${fmtInr(c.maxDiscount)}` : ''}`;
  if (c.kind === 'FLAT') return `${fmtInr(c.value)} off`;
  return 'Free delivery';
}

/** The table behind Marketing › Coupons and Discounts › Automatic. */
export function CouponsList({ automatic, initial, groups }: { automatic: boolean; initial: CouponRow[]; groups: { id: string; name: string }[] }) {
  const me = useCurrentUser();
  const { data = initial } = useCoupons(automatic, initial);
  const [tab, setTab] = useState<CouponState | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [deleting, setDeleting] = useState<CouponRow | null>(null);
  const setActive = useSetCouponActive();
  const del = useDeleteCoupon();
  const rows = useMemo(() => data.filter((c) => tab === 'all' || c.state === tab), [data, tab]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, data.filter((c) => t.key === 'all' || c.state === t.key).length])) as Record<string, number>, [data]);
  const name = (c: CouponRow) => c.code ?? c.title;

  function open(c: CouponRow | null) {
    if (!me.isOwner) return toast.error('Only the owner can create or change discounts.');
    setEditing(c);
    setFormOpen(true);
  }

  async function onToggle(c: CouponRow, active: boolean) {
    try {
      await setActive.mutateAsync({ id: c.id, active });
      toast.success(`${name(c)} switched ${active ? 'on' : 'off'}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Copied ${code}`);
    } catch {
      toast.message(`The code is ${code}`);
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn('h-8 rounded-sm2 border px-2.5 text-[12px] font-semibold transition-colors', tab === t.key ? 'border-ink bg-ink text-surface' : 'border-line text-ink-soft hover:text-ink')}
            >
              {t.label} <span className="ml-0.5 tabular-nums opacity-70">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        {me.isOwner && (
          <Button onClick={() => open(null)}>
            <Plus size={13} /> {automatic ? 'New automatic discount' : 'Create coupon'}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-line bg-surface px-6 py-14 text-center text-ink-faint shadow-card">
          {automatic ? <BadgePercent size={28} /> : <TicketPercent size={28} />}
          <p className="text-[13.5px] font-bold text-ink-soft">{tab === 'all' ? (automatic ? 'No automatic discounts yet.' : 'No coupons yet.') : 'Nothing here.'}</p>
          {tab === 'all' && (
            <p className="max-w-[46ch] text-[12px]">
              {automatic ? 'Example: 3% off every order of ₹10,000 or more. It applies by itself, before any coupon.' : 'Example: ICE10 for 10% off cube ice, capped at ₹300, once per customer.'}
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl2 border border-line bg-surface shadow-card">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2.5">{automatic ? 'Discount' : 'Code'}</th>
                <th className="px-2.5 py-2.5">Offer</th>
                <th className="px-2.5 py-2.5">Conditions</th>
                {!automatic && <th className="px-2.5 py-2.5">Used</th>}
                <th className="px-2.5 py-2.5 text-right">Given</th>
                <th className="px-2.5 py-2.5">Valid</th>
                <th className="px-2.5 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => {
                const conditions = [
                  c.minOrderValue ? `Min ${fmtInr(c.minOrderValue)}` : null,
                  c.scope === 'CATEGORIES' ? c.categoryNames.join(', ') || 'Some categories' : null,
                  c.firstOrderOnly ? 'First order' : null,
                  c.customerGroupIds.length ? `${c.customerGroupIds.length} group${c.customerGroupIds.length === 1 ? '' : 's'}` : null,
                  c.perCustomerLimit ? `${c.perCustomerLimit} per customer` : null,
                  c.channels.length === 1 ? (c.channels[0] === 'WEB' ? 'Web only' : 'Manual only') : null,
                ].filter(Boolean);
                const st = STATE_META[c.state];
                return (
                  <tr key={c.id} className="align-top">
                    <td className="px-4 py-3">
                      {c.code ? (
                        <div className="flex items-center gap-1">
                          <span className="rounded-sm2 border border-dashed border-brand/50 bg-brand-light px-1.5 py-0.5 font-mono text-[12px] font-bold text-brand-dark">{c.code}</span>
                          <button type="button" onClick={() => copy(c.code!)} className="rounded-sm2 p-1 text-ink-faint hover:bg-surface-alt hover:text-ink" aria-label={`Copy ${c.code}`}>
                            <Copy size={12} />
                          </button>
                        </div>
                      ) : (
                        <span className="font-bold text-ink">{c.title}</span>
                      )}
                      {c.code && c.title !== c.code && <div className="mt-1 text-[11.5px] text-ink-faint">{c.title}</div>}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 font-semibold text-ink">{offerText(c)}</td>
                    <td className="max-w-[240px] px-2.5 py-3 text-[12px] text-ink-soft">{conditions.join(' · ') || 'None'}</td>
                    {!automatic && (
                      <td className="px-2.5 py-3">
                        <div className="tabular-nums text-ink">
                          {c.usedCount}
                          {c.usageLimit ? <span className="text-ink-faint"> / {c.usageLimit}</span> : null}
                        </div>
                        {c.usageLimit ? (
                          <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-surface-alt">
                            <div className="h-full bg-brand" style={{ width: `${Math.min(100, (c.usedCount / c.usageLimit) * 100)}%` }} />
                          </div>
                        ) : null}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-2.5 py-3 text-right font-mono tabular-nums text-ink">{fmtInr(c.discountGiven)}</td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-[12px] text-ink-soft">{c.startsAt || c.endsAt ? `${day(c.startsAt) ?? 'Now'} – ${day(c.endsAt) ?? 'no end'}` : 'Always'}</td>
                    <td className="px-2.5 py-3">
                      <span className={cn('rounded-sm2 px-2 py-0.5 text-[11px] font-bold', st.className)}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      {me.isOwner && (
                        <div className="flex items-center justify-end gap-1">
                          <Switch checked={c.active} onChange={(e) => onToggle(c, e.target.checked)} aria-label={`${name(c)} on`} className="mr-1.5" />
                          <button type="button" onClick={() => open(c)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-surface-alt hover:text-ink" aria-label={`Edit ${name(c)}`}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => setDeleting(c)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-brand-light hover:text-brand" aria-label={`Delete ${name(c)}`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CouponFormSheet open={formOpen} onOpenChange={setFormOpen} coupon={editing} automatic={automatic} groups={groups} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting ? name(deleting) : ''}?`}
        description="It stops working straight away. Orders that already used it keep their discount and still show it."
        confirmLabel="Delete"
        pending={del.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast.success(`${name(deleting)} deleted`);
          } catch (e) {
            toast.error((e as Error).message);
          }
          setDeleting(null);
        }}
      />
    </>
  );
}
