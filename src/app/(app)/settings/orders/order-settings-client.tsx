'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import type { InvoiceTrigger } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { updateOrderSettings, type OrderSettings } from '@/actions/orders';
import { cn } from '@/lib/utils';

const TRIGGERS: { value: InvoiceTrigger; title: string; help: string; recommended?: boolean }[] = [
  { value: 'ON_DISPATCH', title: 'When the order is dispatched', help: 'GST expects the tax invoice by the time goods leave, and dispatch is when the vehicle and driver are known for the invoice and e-way bill.', recommended: true },
  { value: 'ON_CONFIRM', title: 'When the order is confirmed', help: 'Suits prepaid orders and businesses that bill before packing.' },
  { value: 'MANUAL', title: 'By hand, from each order', help: 'Staff press Generate invoice. Dispatch offers to generate it if there is none yet.' },
];

export function OrderSettingsClient({ initial }: { initial: OrderSettings }) {
  const router = useRouter();
  const [prefix, setPrefix] = useState(initial.orderPrefix);
  const [next, setNext] = useState(String(initial.nextOrderNo));
  const [trigger, setTrigger] = useState<InvoiceTrigger>(initial.invoiceTrigger);
  const [autoConfirm, setAutoConfirm] = useState(initial.autoConfirmWebOrders);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = await updateOrderSettings({ orderPrefix: prefix, nextOrderNo: Number(next) || 1, invoiceTrigger: trigger, autoConfirmWebOrders: autoConfirm });
    setSaving(false);
    if (r.error) return toast.error(r.error);
    toast.success('Order settings saved');
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/settings" className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-faint hover:text-ink">
        <ChevronLeft size={14} /> Settings
      </Link>
      <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
        <ShoppingBag size={18} className="text-brand" /> Orders & invoicing
      </h1>
      <p className="mt-1 text-[12px] text-ink-faint">How orders are numbered, and when each order’s GST invoice is made.</p>

      <section className="mt-5 rounded-xl2 border border-line bg-surface p-5 shadow-card">
        <h2 className="text-[14px] font-bold text-ink">Order numbers</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Prefix</span>
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} className="font-mono" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Next number</span>
            <Input value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="font-mono" />
          </label>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-faint">
          Next order: <span className="rounded-sm2 bg-surface-alt px-1.5 py-0.5 font-mono text-ink">{`${prefix || 'ORD'}-${next || 1}`}</span>. Orders have their own series. A GST invoice number is only used when an invoice is generated, so cancelled orders never leave gaps in the invoice series.
        </p>
      </section>

      <section className="mt-4 rounded-xl2 border border-line bg-surface p-5 shadow-card">
        <h2 className="text-[14px] font-bold text-ink">When to generate the invoice</h2>
        <div role="radiogroup" className="mt-3 grid gap-2">
          {TRIGGERS.map((t) => (
            <label key={t.value} className={cn('flex cursor-pointer items-start gap-3 rounded-md2 border p-3 transition-colors', trigger === t.value ? 'border-brand bg-brand-light/50' : 'border-line hover:bg-bg')}>
              <input type="radio" name="trigger" value={t.value} checked={trigger === t.value} onChange={() => setTrigger(t.value)} className="mt-1 accent-[hsl(var(--brand))]" />
              <span>
                <span className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-ink">
                  {t.title}
                  {t.recommended && <span className="rounded-sm2 bg-green-soft px-1.5 text-[10px] font-bold text-green">Recommended</span>}
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-soft">{t.help}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-xl2 border border-line bg-surface p-5 shadow-card">
        <h2 className="text-[14px] font-bold text-ink">Web store orders</h2>
        <label className="mt-3 flex items-start justify-between gap-4">
          <span>
            <span className="block text-[13px] font-semibold text-ink">Confirm web orders automatically</span>
            <span className="block text-[12px] text-ink-soft">Off: they wait in Orders › New until someone confirms them.</span>
          </span>
          <Switch checked={autoConfirm} onChange={(e) => setAutoConfirm(e.target.checked)} aria-label="Confirm web orders automatically" />
        </label>
      </section>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
