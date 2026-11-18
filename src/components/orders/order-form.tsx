'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, Info, Package, Plus, Search, TicketPercent, Trash2, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderChannel } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Segmented, selectClass } from '@/components/ui/form-sheet';
import { CHANNEL_META, DELIVERY_SLOTS, MANUAL_CHANNELS } from '@/components/orders/order-meta';
import { listCustomersForBilling } from '@/actions/customers';
import { quoteOrder, type OrderInput, type OrderView, type PaymentMethod } from '@/actions/orders';
import { useProductOptions } from '@/hooks/use-products';
import { useCustomerPriceMap } from '@/hooks/use-pricing';
import { useCreateOrder, useUpdateOrder } from '@/hooks/use-orders';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useModules } from '@/components/modules/modules-provider';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

type Line = { key: string; productId: string | null; name: string; unit: string; qty: string; rate: string; discount: string };
type BillingCustomer = { id: string; name: string; shopName: string | null; phone: string | null; state: string; terms: string; route: string | null; address: string | null; guest: boolean };

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'CREDIT', label: 'Credit (on account)' },
  { value: 'COD', label: 'Cash on delivery' },
  { value: 'UPI', label: 'UPI on delivery' },
  { value: 'CASH', label: 'Cash now' },
];

let keySeq = 0;
const newKey = () => `l${++keySeq}`;

function tomorrowIst(): string {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000 + 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** New order, quick sale (`quick`), or editing `order`. */
export function OrderForm({ order, quick = false, companyState, triggerNote }: { order?: OrderView | null; quick?: boolean; companyState: string; triggerNote: string }) {
  const router = useRouter();
  const discountsOn = useModules().enabled('marketing');
  const create = useCreateOrder();
  const update = useUpdateOrder();
  const editing = !!order;

  const [customerId, setCustomerId] = useState(order?.customer.id ?? '');
  const [channel, setChannel] = useState<OrderChannel>(order?.channel ?? (quick ? 'WALK_IN' : 'PHONE'));
  const [lines, setLines] = useState<Line[]>(
    () => order?.items.map((i) => ({ key: newKey(), productId: i.productId, name: i.name, unit: i.unit, qty: String(i.qty), rate: String(i.rate), discount: i.discount ? String(i.discount) : '' })) ?? []
  );
  const [couponInput, setCouponInput] = useState(order?.couponCode ?? '');
  const [coupon, setCoupon] = useState(order?.couponCode ?? '');
  const [deliveryCharge, setDeliveryCharge] = useState(order?.deliveryCharge ? String(order.deliveryCharge) : '');
  const [deliveryDate, setDeliveryDate] = useState(order?.deliveryDate ? order.deliveryDate.slice(0, 10) : quick ? '' : tomorrowIst());
  const [deliverySlot, setDeliverySlot] = useState(order?.deliverySlot ?? (quick ? 'Customer pickup' : ''));
  const [payment, setPayment] = useState<PaymentMethod>((order?.paymentMethod as PaymentMethod) ?? (quick ? 'CASH' : 'CREDIT'));
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [paidNow, setPaidNow] = useState(true);
  const [paidMode, setPaidMode] = useState('Cash');

  const { data: customers = [] } = useQuery({ queryKey: ['customers', 'billing'], queryFn: () => listCustomersForBilling() as Promise<BillingCustomer[]>, staleTime: 60_000 });
  const { data: products = [] } = useProductOptions();
  const { data: priceMap = [] } = useCustomerPriceMap(customerId || null);
  const customer = customers.find((c) => c.id === customerId) ?? null;

  /** The price for a product+unit: this customer's special price, else the catalog's. */
  function priceFor(productId: string, unit: string): number {
    const special = priceMap.find((p) => p.productId === productId && p.unit === unit);
    if (special) return special.price;
    const p = products.find((x) => x.id === productId);
    const tier = p?.priceTiers.find((t) => t.unit === unit);
    return Number(tier?.price ?? p?.price ?? 0);
  }

  function addProduct(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const unit = p.priceTiers[0]?.unit ?? p.unit;
    setLines((ls) => [...ls, { key: newKey(), productId: p.id, name: p.name, unit, qty: '1', rate: String(priceFor(p.id, unit)), discount: '' }]);
  }

  function setLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // A customer's special prices replace catalog prices on lines added before
  // the customer was picked.
  const pricedFor = useRef<string>('');
  useEffect(() => {
    if (!customerId || pricedFor.current === customerId || editing) return;
    pricedFor.current = customerId;
    setLines((ls) => ls.map((l) => (l.productId ? { ...l, rate: String(priceFor(l.productId, l.unit)) } : l)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, priceMap]);

  const input: OrderInput | null = useMemo(() => {
    const valid = lines.filter((l) => Number(l.qty) > 0 && l.name.trim());
    if (!customerId || valid.length === 0) return null;
    return {
      customerId,
      channel,
      lines: valid.map((l) => ({ productId: l.productId, name: l.name.trim(), unit: l.unit, qty: Number(l.qty), rate: Number(l.rate) || 0, discount: Number(l.discount) || 0 })),
      couponCode: coupon || null,
      deliveryCharge: Number(deliveryCharge) || 0,
      deliveryDate: deliveryDate || null,
      deliverySlot: deliverySlot || null,
      paymentMethod: payment,
      notes: notes || null,
    };
  }, [customerId, channel, lines, coupon, deliveryCharge, deliveryDate, deliverySlot, payment, notes]);

  const quoteKey = useDebouncedValue(input ? JSON.stringify({ ...input, notes: null, deliveryDate: null, deliverySlot: null }) : '', 250);
  const { data: quoteRes, isFetching: quoting } = useQuery({
    queryKey: ['order-quote', quoteKey, order?.id ?? null],
    queryFn: () => quoteOrder(JSON.parse(quoteKey) as OrderInput, order?.id ?? null),
    enabled: !!quoteKey,
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });
  const quote = input ? quoteRes?.quote : undefined;

  async function save(mode: 'draft' | 'order' | 'invoice' | 'quick') {
    if (!customerId) return toast.error('Pick a customer first.');
    if (!input) return toast.error('Add at least one item with a quantity.');
    if (quote?.couponError && coupon) return toast.error(`Fix or remove the coupon: ${quote.couponError}`);
    try {
      const r = editing
        ? await update.mutateAsync({ id: order!.id, input })
        : await create.mutateAsync({ input, mode, paid: mode === 'quick' ? paidNow : undefined, paymentMode: mode === 'quick' ? paidMode : undefined });
      if (editing) toast.success(`${order!.number} saved`);
      else if (r.invoiceNumber) toast.success(`${r.number} created and invoiced as ${r.invoiceNumber}`);
      else toast.success(mode === 'draft' ? `Draft ${r.number} saved` : `${r.number} created`);
      if (r.warning) toast.warning(r.warning, { duration: 8000 });
      router.push(`/orders/${r.id ?? order?.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;
  const title = editing ? `Edit ${order!.number}` : quick ? 'Quick sale' : 'New order';

  return (
    <div>
      <div className="mb-4">
        <Link href={editing ? `/orders/${order!.id}` : '/orders'} className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-faint hover:text-ink">
          <ChevronLeft size={14} /> {editing ? order!.number : 'Orders'}
        </Link>
        <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
          {quick && <Zap size={18} className="text-brand" />}
          {title}
        </h1>
        <p className="mt-1 max-w-[70ch] text-[12px] text-ink-faint">
          {quick
            ? 'For counter and walk-in sales: the order is created, invoiced and handed over in one step, so every invoice still has an order.'
            : editing
              ? 'Changes reprice the order and re-check its coupon. Once the invoice is generated, changes go through Returns.'
              : 'For orders taken by phone, WhatsApp, at the counter or by a sales rep. Web store orders arrive on their own.'}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card sm:p-5">
            <h2 className="mb-3 text-[13.5px] font-bold text-ink">Customer</h2>
            <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} disabled={false} />
            {customer && (
              <p className="mt-2 text-[11.5px] text-ink-faint">
                {customer.state}
                {customer.state.trim().toLowerCase() !== companyState.trim().toLowerCase() ? ' (inter-state, IGST)' : ''} · {customer.terms}
                {customer.route ? ` · route ${customer.route}` : ''}
                {customer.phone ? ` · ${customer.phone}` : ''}
              </p>
            )}
            {!editing && (
              <div className="mt-4">
                <span className="mb-1.5 block text-[11.5px] font-semibold text-ink-body">Order came in by</span>
                <Segmented
                  label="Order came in by"
                  value={channel}
                  onChange={setChannel}
                  options={MANUAL_CHANNELS.map((c) => ({ value: c, label: CHANNEL_META[c].label }))}
                  className="max-sm:!grid-cols-3"
                />
              </div>
            )}
          </section>

          <section className="rounded-xl2 border border-line bg-surface shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
              <h2 className="text-[13.5px] font-bold text-ink">Items</h2>
              <span className="text-[11.5px] text-ink-faint">{customerId ? 'Customer prices apply where set' : 'Catalog prices until a customer is picked'}</span>
            </div>
            <div className="px-4 py-3 sm:px-5">
              <ProductAdder products={products} onAdd={addProduct} />
            </div>
            {lines.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 border-t border-line px-6 py-8 text-center text-ink-faint">
                <Package size={24} />
                <p className="text-[12.5px]">Search above to add the first item.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[640px] text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                      <th className="px-4 py-2 sm:px-5">Item</th>
                      <th className="px-2 py-2">Unit</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Rate ₹</th>
                      <th className="px-2 py-2 text-right">Disc %</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {lines.map((l) => {
                      const p = l.productId ? products.find((x) => x.id === l.productId) : null;
                      const units = p ? (p.priceTiers.length ? p.priceTiers.map((t) => t.unit) : [p.unit]) : [l.unit];
                      const amount = (Number(l.qty) || 0) * (Number(l.rate) || 0) * (1 - (Number(l.discount) || 0) / 100);
                      return (
                        <tr key={l.key}>
                          <td className="px-4 py-2 sm:px-5">
                            <div className="font-semibold text-ink">{l.name}</div>
                            {p?.category && <div className="text-[11px] text-ink-faint">{p.category}</div>}
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={l.unit}
                              onChange={(e) => setLine(l.key, { unit: e.target.value, rate: l.productId ? String(priceFor(l.productId, e.target.value)) : l.rate })}
                              className={cn(selectClass, 'h-8 w-24')}
                              aria-label={`Unit for ${l.name}`}
                            >
                              {units.map((u) => (
                                <option key={u}>{u}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <Input value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} inputMode="decimal" className="h-8 w-20 text-right font-mono" aria-label={`Quantity of ${l.name}`} />
                          </td>
                          <td className="px-2 py-2">
                            <Input value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} inputMode="decimal" className="h-8 w-24 text-right font-mono" aria-label={`Rate for ${l.name}`} />
                          </td>
                          <td className="px-2 py-2">
                            <Input value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} inputMode="decimal" placeholder="0" className="h-8 w-16 text-right font-mono" aria-label={`Discount on ${l.name}`} />
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-bold tabular-nums text-ink">{fmtInr(amount)}</td>
                          <td className="pr-3">
                            <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-faint hover:bg-brand-light hover:text-brand" aria-label={`Remove ${l.name}`}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card sm:p-5">
            <h2 className="mb-3 text-[13.5px] font-bold text-ink">{quick ? 'Payment' : 'Delivery and payment'}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {!quick && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Delivery date</span>
                    <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Slot</span>
                    <select value={deliverySlot} onChange={(e) => setDeliverySlot(e.target.value)} className={selectClass}>
                      <option value="">Any time</option>
                      {DELIVERY_SLOTS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Delivery charge (₹)</span>
                    <Input value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} inputMode="decimal" placeholder="0" className="font-mono" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Payment</span>
                    <select value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)} className={selectClass}>
                      {PAYMENT_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {quick && (
                <>
                  <label className="flex items-center justify-between gap-3 rounded-md2 border border-line px-3 py-2.5 sm:col-span-2">
                    <span>
                      <span className="block text-[13px] font-semibold text-ink">Paid now</span>
                      <span className="block text-[11.5px] text-ink-faint">Records the payment and a receipt on the invoice.</span>
                    </span>
                    <Switch checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} aria-label="Paid now" />
                  </label>
                  {paidNow && (
                    <label className="block">
                      <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Paid by</span>
                      <select value={paidMode} onChange={(e) => setPaidMode(e.target.value)} className={selectClass}>
                        {['Cash', 'UPI', 'Card', 'Bank transfer'].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">{quick ? 'Note' : 'Notes for packing and delivery'}</span>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} placeholder={quick ? 'Optional' : 'e.g. Gate 3, call on arrival'} />
              </label>
            </div>
          </section>
        </div>

        <aside className="grid gap-3 rounded-xl2 border border-line bg-surface p-4 shadow-card sm:p-5 lg:sticky lg:top-[78px]" aria-label="Order summary">
          <h2 className="text-[13.5px] font-bold text-ink">Summary</h2>

          {!discountsOn ? null : coupon && quote?.coupon ? (
            <div className="flex items-center gap-2 rounded-md2 border border-dashed border-green bg-green-soft px-3 py-2 text-[12px] font-semibold text-green">
              <TicketPercent size={14} />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-mono">{quote.coupon.code}</span> · {quote.coupon.title}
              </span>
              <button type="button" onClick={() => (setCoupon(''), setCouponInput(''))} className="rounded-sm2 p-0.5 hover:bg-green/10" aria-label="Remove coupon">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setCoupon(couponInput.trim()))}
                  placeholder="Coupon code"
                  className="font-mono uppercase"
                  aria-label="Coupon code"
                />
                <Button type="button" variant="outline" onClick={() => setCoupon(couponInput.trim())} disabled={!couponInput.trim()}>
                  Apply
                </Button>
              </div>
              {coupon && quote?.couponError && <p className="mt-1.5 text-[11.5px] font-semibold text-red">{quote.couponError}</p>}
            </div>
          )}

          {quote ? (
            <dl className={cn('grid gap-1.5 text-[12.5px] transition-opacity', quoting && 'opacity-60')}>
              <Row label="Items" value={fmtInr(quote.subtotal)} />
              {quote.auto && <Row label={`${quote.auto.title} (automatic)`} value={`− ${fmtInr(quote.auto.amount)}`} green />}
              {quote.coupon && quote.coupon.amount > 0 && <Row label={`Coupon ${quote.coupon.code}`} value={`− ${fmtInr(quote.coupon.amount)}`} green />}
              {quote.deliveryWaived > 0 ? <Row label="Delivery (waived)" value={<s className="text-ink-faint">{fmtInr(quote.deliveryWaived)}</s>} green /> : quote.deliveryCharge > 0 ? <Row label="Delivery" value={fmtInr(quote.deliveryCharge)} /> : null}
              <Row label="Taxable value" value={fmtInr(quote.taxable)} strong />
              {quote.useIgst ? (
                <Row label="IGST" value={fmtInr(quote.igst)} />
              ) : (
                <>
                  <Row label="CGST" value={fmtInr(quote.cgst)} />
                  <Row label="SGST" value={fmtInr(quote.sgst)} />
                </>
              )}
              {Math.abs(quote.roundOff) >= 0.005 && <Row label="Round off" value={fmtInr(quote.roundOff)} />}
              <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2.5">
                <dt className="text-[14px] font-extrabold text-ink">Total</dt>
                <dd className="font-mono text-[18px] font-extrabold tabular-nums text-ink">{fmtInr(quote.total)}</dd>
              </div>
            </dl>
          ) : (
            <p className="rounded-md2 bg-bg px-3 py-4 text-center text-[12px] text-ink-faint">{customerId ? 'Add items to see the total.' : 'Pick a customer and add items to see the total.'}</p>
          )}

          {quote?.creditWarning && payment === 'CREDIT' && (
            <p className="flex items-start gap-2 rounded-md2 bg-gold-soft px-3 py-2 text-[11.5px] font-semibold text-ink-body">
              <AlertTriangle size={14} className="mt-px flex-shrink-0 text-gold" /> {quote.creditWarning}
            </p>
          )}
          {!editing && (
            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-faint">
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              <span>{quick ? 'The invoice is generated straight away.' : triggerNote}</span>
            </p>
          )}

          <div className="grid gap-2 pt-1">
            {editing ? (
              <Button onClick={() => save('order')} disabled={pending}>
                Save changes
              </Button>
            ) : quick ? (
              <Button onClick={() => save('quick')} disabled={pending}>
                <Zap size={13} /> Complete sale
              </Button>
            ) : (
              <>
                <Button onClick={() => save('order')} disabled={pending}>
                  Create order
                </Button>
                <Button variant="outline" onClick={() => save('invoice')} disabled={pending}>
                  Create and generate invoice
                </Button>
                <Button variant="ghost" onClick={() => save('draft')} disabled={pending}>
                  Save as draft
                </Button>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, green, strong }: { label: string; value: React.ReactNode; green?: boolean; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', strong && 'border-t border-dashed border-line pt-1.5')}>
      <dt className={cn('min-w-0 truncate', strong ? 'font-bold text-ink' : 'text-ink-soft')}>{label}</dt>
      <dd className={cn('whitespace-nowrap font-mono tabular-nums', green ? 'text-green' : 'text-ink', strong && 'font-bold')}>{value}</dd>
    </div>
  );
}

function CustomerPicker({ customers, value, onChange, disabled }: { customers: BillingCustomer[]; value: string; onChange: (id: string) => void; disabled: boolean }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value);
  const q = query.trim().toLowerCase();
  const matches = customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.shopName ?? '').toLowerCase().includes(q) || (c.phone ?? '').includes(q)).slice(0, 8);

  if (selected && !open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md2 border border-line px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold text-ink">{selected.shopName || selected.name}</div>
          {selected.shopName && <div className="truncate text-[11.5px] text-ink-faint">{selected.name}</div>}
        </div>
        {!disabled && (
          <Button size="sm" variant="ghost" onClick={() => (setOpen(true), setQuery(''))}>
            Change
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-[11px] text-ink-faint" />
      <Input
        autoFocus={open}
        value={query}
        onChange={(e) => (setQuery(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) {
            e.preventDefault();
            onChange(matches[0].id);
            setOpen(false);
          }
        }}
        placeholder="Search customers by name, shop or phone"
        className="pl-8"
        aria-label="Customer"
      />
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto rounded-md2 border border-line bg-popover p-1 shadow-elevated">
          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-[12px] text-ink-faint">
              No customer matches. <Link href="/customers" className="font-semibold text-brand">Add one in Customers</Link>.
            </p>
          ) : (
            matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (onChange(c.id), setOpen(false))}
                className="flex w-full items-center justify-between gap-3 rounded-sm2 px-3 py-2 text-left hover:bg-brand-light"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">{c.shopName || c.name}</span>
                  <span className="block truncate text-[11px] text-ink-faint">{[c.shopName ? c.name : null, c.phone, c.state].filter(Boolean).join(' · ')}</span>
                </span>
                {c.guest && <span className="rounded-sm2 bg-surface-alt px-1.5 text-[10px] font-bold text-ink-soft">Guest</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type ProductOpt = { id: string; name: string; category: string; unit: string; price: string; priceTiers: { unit: string; price: string; approxQty: string | null }[] };

function ProductAdder({ products, onAdd }: { products: ProductOpt[]; onAdd: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const matches = products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)).slice(0, 10);
  function pick(id: string) {
    onAdd(id);
    setQuery('');
  }
  return (
    <div className="relative">
      <Plus size={14} className="pointer-events-none absolute left-2.5 top-[11px] text-ink-faint" />
      <Input
        value={query}
        onChange={(e) => (setQuery(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) {
            e.preventDefault();
            pick(matches[0].id);
          }
        }}
        placeholder="Add an item: search products or categories"
        className="pl-8"
        aria-label="Add an item"
      />
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto rounded-md2 border border-line bg-popover p-1 shadow-elevated">
          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-[12px] text-ink-faint">No product matches.</p>
          ) : (
            matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p.id)}
                className="flex w-full items-center justify-between gap-3 rounded-sm2 px-3 py-2 text-left hover:bg-brand-light"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">{p.name}</span>
                  <span className="block truncate text-[11px] text-ink-faint">{p.category}</span>
                </span>
                <span className="whitespace-nowrap font-mono text-[12px] text-ink-soft">
                  {fmtInr(Number(p.priceTiers[0]?.price ?? p.price))}/{p.priceTiers[0]?.unit ?? p.unit}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
