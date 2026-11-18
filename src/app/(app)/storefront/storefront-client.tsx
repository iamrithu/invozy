'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Plus, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AffixInput } from '@/components/ui/form-sheet';
import { useCurrentUser } from '@/components/current-user';
import { updateStore, type StoreAdmin } from '@/actions/storefront';
import { cn } from '@/lib/utils';

export function StorefrontClient({ initial }: { initial: StoreAdmin }) {
  const router = useRouter();
  const me = useCurrentUser();
  const [slug, setSlug] = useState(initial.slug ?? initial.suggestedSlug);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [s, setS] = useState(initial.settings);
  const [newSlot, setNewSlot] = useState('');
  const [saving, setSaving] = useState(false);
  const [slugError, setSlugError] = useState<string>();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/s/${initial.slug ?? slug}`;
  const c = initial.checks;

  async function save(nextEnabled = enabled) {
    const was = enabled;
    // The switch moves straight away and moves back if the save fails.
    setEnabled(nextEnabled);
    setSaving(true);
    setSlugError(undefined);
    const r = await updateStore({ slug, enabled: nextEnabled, settings: s });
    setSaving(false);
    if (r.error) {
      setEnabled(was);
      setSlugError(r.fieldErrors?.slug);
      return toast.error(r.error);
    }
    toast.success(nextEnabled ? 'Store is open and saved' : 'Store saved (closed to customers)');
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Store link copied');
    } catch {
      toast.message(url);
    }
  }

  const checks: { ok: boolean; label: string; href?: string; action?: string }[] = [
    { ok: c.categoriesShown > 0, label: c.categoriesShown ? `${c.categoriesShown} categories with ${c.productsShown} products on the store` : 'No categories on the store yet', href: '/categories', action: 'Categories' },
    { ok: c.categoriesWithoutImage === 0, label: c.categoriesWithoutImage ? `${c.categoriesWithoutImage} shown categories have no image` : 'Every shown category has an image', href: '/categories', action: 'Add images' },
    { ok: c.zones > 0, label: c.zones ? `${c.zones} delivery zone${c.zones === 1 ? '' : 's'}` : 'No delivery zones: the store accepts any PIN code with no delivery charge', href: '/delivery-zones', action: 'Zones' },
    { ok: c.hasLogo, label: c.hasLogo ? 'Logo set' : 'No logo yet', href: '/company', action: 'Company profile' },
    { ok: !!(s.contactPhone || c.hasPhone), label: s.contactPhone || c.hasPhone ? 'Contact phone shown' : 'No contact phone', href: undefined },
  ];

  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
            <Store size={18} className="text-brand" /> Storefront
          </h1>
          <p className="mt-1 max-w-[70ch] text-[12px] text-ink-faint">Your public catalog. Customers order here without an account; orders land in Orders › New for you to confirm.</p>
        </div>
        {initial.slug && initial.enabled && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={copy}>
              <Copy size={13} /> Copy link
            </Button>
            <Button variant="outline" asChild>
              <a href={`/s/${initial.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> Open store
              </a>
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <section className="rounded-xl2 border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-bold text-ink">Store address and status</h2>
                <p className="mt-0.5 text-[12px] text-ink-faint">{enabled ? `Open · ${initial.webOrders7d} web order${initial.webOrders7d === 1 ? '' : 's'} in the last 7 days` : 'Closed: visitors see a “not taking orders” page.'}</p>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
                {enabled ? 'Open' : 'Closed'}
                <Switch checked={enabled} disabled={!me.isOwner || saving} onChange={(e) => save(e.target.checked)} aria-label="Store open" />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Store address</span>
              <AffixInput before={<span className="font-mono text-[11px]">{origin || 'invozy'}/s/</span>} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="font-mono" invalid={!!slugError} disabled={!me.isOwner} />
              {slugError ? <span className="mt-1 block text-[11.5px] font-semibold text-red">{slugError}</span> : <span className="mt-1 block text-[11.5px] text-ink-faint">Share this link on WhatsApp, Google and your invoices.</span>}
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Welcome line</span>
              <Input value={s.welcome} onChange={(e) => setS({ ...s, welcome: e.target.value })} maxLength={160} placeholder="Ice delivered cold across Coimbatore, 6 AM to 8 PM." disabled={!me.isOwner} />
            </label>
          </section>

          <section className="rounded-xl2 border border-line bg-surface p-5 shadow-card">
            <h2 className="text-[14px] font-bold text-ink">Ordering rules</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Minimum order</span>
                <AffixInput before="₹" value={String(s.minOrder || '')} onChange={(e) => setS({ ...s, minOrder: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} inputMode="decimal" placeholder="0" disabled={!me.isOwner} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Same-day cut-off</span>
                <Input type="time" value={s.sameDayCutoff} onChange={(e) => setS({ ...s, sameDayCutoff: e.target.value })} disabled={!me.isOwner} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Contact phone</span>
                <Input value={s.contactPhone} onChange={(e) => setS({ ...s, contactPhone: e.target.value })} inputMode="tel" placeholder="Shown on the store" disabled={!me.isOwner} />
              </label>
            </div>
            <p className="mt-2 text-[11.5px] text-ink-faint">Orders placed after the cut-off are for the next day.</p>
            <div className="mt-4">
              <span className="mb-1.5 block text-[11.5px] font-semibold text-ink-body">Delivery slots</span>
              <div className="flex flex-wrap gap-1.5">
                {s.slots.map((slot) => (
                  <span key={slot} className="inline-flex h-8 items-center gap-1 rounded-sm2 border border-line bg-bg pl-2.5 pr-1 text-[12px] font-semibold text-ink">
                    {slot}
                    {me.isOwner && (
                      <button type="button" onClick={() => setS({ ...s, slots: s.slots.filter((x) => x !== slot) })} className="rounded-sm2 p-0.5 text-ink-faint hover:text-ink" aria-label={`Remove ${slot}`}>
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
                {me.isOwner && (
                  <span className="inline-flex gap-1">
                    <Input value={newSlot} onChange={(e) => setNewSlot(e.target.value)} placeholder="6–8 PM" className="h-8 w-28" onKeyDown={(e) => e.key === 'Enter' && newSlot.trim() && (setS({ ...s, slots: [...s.slots, newSlot.trim()] }), setNewSlot(''))} />
                    <Button type="button" size="sm" variant="outline" disabled={!newSlot.trim()} onClick={() => (setS({ ...s, slots: [...s.slots, newSlot.trim()] }), setNewSlot(''))}>
                      <Plus size={13} />
                    </Button>
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl2 border border-line bg-surface p-5 shadow-card">
            <h2 className="text-[14px] font-bold text-ink">Payment methods</h2>
            <div className="mt-2 divide-y divide-line">
              {(
                [
                  ['payCod', 'Cash on delivery', 'The driver collects; mark it collected when you mark the order delivered.'],
                  ['payUpi', 'UPI on delivery', 'The driver shows your UPI QR (already on your invoices).'],
                ] as const
              ).map(([k, title, help]) => (
                <label key={k} className="flex items-start justify-between gap-4 py-3">
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">{title}</span>
                    <span className="block text-[12px] text-ink-soft">{help}</span>
                  </span>
                  <Switch checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} disabled={!me.isOwner} aria-label={title} />
                </label>
              ))}
              <div className="flex items-start justify-between gap-4 py-3 opacity-70">
                <span>
                  <span className="block text-[13px] font-semibold text-ink">Pay online</span>
                  <span className="block text-[12px] text-ink-soft">Needs your own Razorpay account. Coming soon.</span>
                </span>
              </div>
            </div>
          </section>

          {me.isOwner && (
            <div className="flex justify-end">
              <Button onClick={() => save()} disabled={saving}>
                Save store settings
              </Button>
            </div>
          )}
        </div>

        <aside className="rounded-xl2 border border-line bg-surface p-5 shadow-card lg:sticky lg:top-[78px]">
          <h2 className="text-[14px] font-bold text-ink">Setup</h2>
          <ul className="mt-3 grid gap-3">
            {checks.map((ch) => (
              <li key={ch.label} className="flex items-start gap-2.5 text-[12.5px]">
                {ch.ok ? <CheckCircle2 size={16} className="mt-px flex-shrink-0 text-green" /> : <AlertCircle size={16} className="mt-px flex-shrink-0 text-gold" />}
                <span className="min-w-0 flex-1 text-ink-body">
                  {ch.label}
                  {!ch.ok && ch.href && (
                    <Link href={ch.href} className={cn('ml-1.5 font-semibold text-brand')}>
                      {ch.action}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-faint">
            The store shows active products in categories set to show on the store, at catalog prices. Customer special prices aren’t applied online; edit a web order before confirming it to change a price.
          </p>
        </aside>
      </div>
    </div>
  );
}
