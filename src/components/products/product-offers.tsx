'use client';

import { useState } from 'react';
import { Check, Gift, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUnit } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { useDeleteScheme, useSaveScheme, useSchemes } from '@/hooks/use-pricing';
import type { SchemeRow } from '@/actions/pricing';

const inputClass =
  'w-full rounded-sm2 border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20';

function shortDate(d: string) {
  return new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function qty(n: number) {
  return String(Math.round(n * 100) / 100);
}

/** Where an offer stands today — what the builder will actually do with it. */
function offerState(s: SchemeRow): { label: string; tone: string } {
  const today = todayIst();
  if (!s.active) return { label: 'Off', tone: 'bg-surface-alt text-ink-faint' };
  if (s.validTo && s.validTo < today) return { label: 'Ended', tone: 'bg-surface-alt text-ink-faint' };
  if (s.validFrom && s.validFrom > today) return { label: `Starts ${shortDate(s.validFrom)}`, tone: 'bg-gold-soft text-gold' };
  return { label: 'Running', tone: 'bg-green-soft text-green' };
}

/** "Offers" section of the product detail sheet — "Buy N, get M free" on
 * one of this product's units, optionally limited to a date range. The
 * invoice builder suggests the free line once a line reaches the "buy"
 * quantity. */
export function ProductOffers({ productId, units }: { productId: string; units: string[] }) {
  const { data: schemes, isLoading } = useSchemes(productId);
  const saveScheme = useSaveScheme();
  const deleteScheme = useDeleteScheme();
  const [adding, setAdding] = useState(false);

  async function toggle(s: SchemeRow) {
    try {
      await saveScheme.mutateAsync({ ...s, active: !s.active });
      toast.success(s.active ? 'Offer switched off' : 'Offer switched on');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(s: SchemeRow) {
    try {
      await deleteScheme.mutateAsync(s.id);
      toast.success('Offer removed');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <section className="mt-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] font-extrabold text-ink">
          <Gift size={13} /> Offers
        </div>
        {!adding && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add offer
          </Button>
        )}
      </div>
      <p className="mb-2 text-[11px] text-ink-faint">Buy a quantity, get some free. Suggested on invoices automatically.</p>

      {adding && <OfferForm productId={productId} units={units} onDone={() => setAdding(false)} />}

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : !schemes || schemes.length === 0 ? (
        !adding && <p className="rounded-lg2 border border-dashed border-line p-3 text-center text-[12px] text-ink-faint">No offers on this product.</p>
      ) : (
        <div className="overflow-hidden rounded-lg2 border border-line">
          {schemes.map((s) => {
            const state = offerState(s);
            const u = formatUnit(s.unit);
            return (
              <div key={s.id} className="flex items-center gap-2.5 border-b border-line px-2.5 py-2 text-[12.5px] last:border-0">
                <div className="min-w-0 flex-1">
                  <div className={`font-bold ${s.active ? 'text-ink' : 'text-ink-faint'}`}>
                    Buy {qty(s.buyQty)} {u}, get {qty(s.freeQty)} {u} free
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-faint">
                    {s.name && <span>{s.name} ·</span>}
                    <span>
                      {s.validFrom && s.validTo
                        ? `${shortDate(s.validFrom)} – ${shortDate(s.validTo)}`
                        : s.validTo
                          ? `Until ${shortDate(s.validTo)}`
                          : s.validFrom
                            ? `From ${shortDate(s.validFrom)}`
                            : 'No end date'}
                    </span>
                    <span className={`rounded-sm2 px-1.5 py-px text-[10px] font-bold ${state.tone}`}>{state.label}</span>
                  </div>
                </div>
                <Switch checked={s.active} disabled={saveScheme.isPending} onChange={() => toggle(s)} aria-label={s.active ? 'Switch offer off' : 'Switch offer on'} />
                <button
                  type="button"
                  onClick={() => remove(s)}
                  disabled={deleteScheme.isPending}
                  aria-label="Remove offer"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 text-ink-faint hover:bg-red-soft hover:text-red disabled:opacity-40"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OfferForm({ productId, units, onDone }: { productId: string; units: string[]; onDone: () => void }) {
  const saveScheme = useSaveScheme();
  const [unit, setUnit] = useState(units[0] ?? '');
  const [buy, setBuy] = useState('');
  const [free, setFree] = useState('');
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function save() {
    const buyQty = Number(buy);
    const freeQty = Number(free);
    if (!(buyQty > 0) || !(freeQty > 0)) return toast.error('Enter how many to buy and how many are free.');
    if (from && to && to < from) return toast.error('The end date is before the start date.');
    try {
      await saveScheme.mutateAsync({ productId, unit, buyQty, freeQty, name: name.trim() || null, validFrom: from || null, validTo: to || null, active: true });
      toast.success('Offer added');
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const u = formatUnit(unit);

  return (
    <div className="mb-2.5 space-y-2.5 rounded-lg2 border border-line bg-bg p-3">
      <div className="grid grid-cols-3 gap-2.5">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Unit</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass}>
            {units.map((x) => (
              <option key={x} value={x}>
                {formatUnit(x)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Buy</label>
          <input type="number" min="0" step="any" inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="10" className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Get free</label>
          <input type="number" min="0" step="any" inputMode="decimal" value={free} onChange={(e) => setFree(e.target.value)} placeholder="1" className={`${inputClass} font-mono`} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Name (optional)</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer scheme" maxLength={80} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">From (optional)</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-faint">Until (optional)</label>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </div>
      </div>
      {Number(buy) > 0 && Number(free) > 0 && (
        <p className="text-[11.5px] font-semibold text-ink-soft">
          Buy {qty(Number(buy))} {u}, get {qty(Number(free))} {u} free.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saveScheme.isPending || !unit}>
          <Check size={13} /> {saveScheme.isPending ? 'Saving…' : 'Save offer'}
        </Button>
      </div>
    </div>
  );
}
