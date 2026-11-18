'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronLeft, Minus, Plus, ShoppingBag, TicketPercent, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '@/components/store/cart';
import { STATE_NAMES } from '@/components/ui/location-field';
import { placeStoreOrder, quoteStoreOrder } from '@/actions/store';
import type { StoreProduct } from '@/lib/store-public';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

const field = 'h-11 w-full rounded-md2 border bg-surface px-3 text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-light';

export function CheckoutClient(props: {
  slug: string;
  storeName: string;
  products: StoreProduct[];
  defaultState: string;
  slots: string[];
  earliest: string;
  payCod: boolean;
  payUpi: boolean;
  zones: number;
}) {
  const router = useRouter();
  const cart = useCart();
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState(props.defaultState);
  const [gstin, setGstin] = useState('');
  const [date, setDate] = useState(props.earliest);
  const [slot, setSlot] = useState(props.slots[0] ?? '');
  const [payment, setPayment] = useState<'COD' | 'UPI'>(props.payCod ? 'COD' : 'UPI');
  const [notes, setNotes] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);

  // Restore the visitor's details from their last order on this store.
  const detailsKey = `invozy-buyer:${props.slug}`;
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(detailsKey) || '{}');
      if (d.name) setName(d.name);
      if (d.shopName) setShopName(d.shopName);
      if (d.phone) setPhone(d.phone);
      if (d.address) setAddress(d.address);
      if (d.pincode) setPincode(d.pincode);
      if (d.state) setState(d.state);
      if (d.gstin) setGstin(d.gstin);
    } catch {
      /* nothing saved */
    }
  }, [detailsKey]);

  const lines = useMemo(
    () =>
      cart.lines
        .map((l) => {
          const p = props.products.find((x) => x.id === l.productId);
          const price = p?.units.find((u) => u.unit === l.unit)?.price;
          return p && price != null ? { ...l, name: p.name, price } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
    [cart.lines, props.products]
  );

  const quoteArgs = useDebouncedValue(JSON.stringify({ cart: cart.lines, pincode: /^\d{6}$/.test(pincode) ? pincode : null, state, couponCode: coupon || null, phone: phone.length >= 10 ? phone : null }), 300);
  const { data: q, isFetching } = useQuery({
    queryKey: ['store-quote', props.slug, quoteArgs],
    queryFn: () => quoteStoreOrder(props.slug, JSON.parse(quoteArgs)),
    enabled: cart.ready && cart.lines.length > 0,
    placeholderData: (prev) => prev,
  });
  const quote = q?.quote;

  async function place() {
    setErrors({});
    setPlacing(true);
    const r = await placeStoreOrder(props.slug, {
      name,
      shopName: shopName || null,
      phone,
      address,
      pincode,
      state,
      gstin: gstin || null,
      cart: cart.lines,
      couponCode: coupon || null,
      deliveryDate: date,
      slot: slot || null,
      payment,
      notes: notes || null,
      website,
    });
    setPlacing(false);
    if (r.error || !r.token) {
      setErrors(r.fieldErrors ?? {});
      toast.error(r.error ?? 'Your order wasn’t placed. Please try again.');
      return;
    }
    try {
      localStorage.setItem(detailsKey, JSON.stringify({ name, shopName, phone, address, pincode, state, gstin }));
    } catch {
      /* not remembered */
    }
    cart.clear();
    router.push(`/s/${props.slug}/o/${r.token}`);
  }

  if (cart.ready && cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <ShoppingBag size={30} className="text-ink-faint" />
        <p className="text-[14px] font-semibold text-ink-soft">Your cart is empty.</p>
        <Link href={`/s/${props.slug}`} className="rounded-md2 bg-brand px-4 py-2.5 text-[13.5px] font-bold text-white">
          Browse products
        </Link>
      </div>
    );
  }

  const err = (k: string) => errors[k] && <span className="mt-1 block text-[12px] font-semibold text-red">{errors[k]}</span>;
  const canPlace = !!quote && !quote.blocker && !(coupon && quote.couponError) && !placing && !isFetching;

  return (
    <div className="pb-10">
      <Link href={`/s/${props.slug}`} className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-faint hover:text-ink">
        <ChevronLeft size={15} /> Keep shopping
      </Link>
      <h1 className="mb-4 text-[20px] font-extrabold text-ink">Checkout</h1>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
            <h2 className="mb-3 text-[14.5px] font-bold text-ink">Your details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-body">Your name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={cn(field, errors.name ? 'border-red' : 'border-line')} />
                {err('name')}
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-body">Phone</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" className={cn(field, errors.phone ? 'border-red' : 'border-line')} />
                {err('phone')}
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[12px] font-semibold text-ink-body">Business name (optional)</span>
                <input value={shopName} onChange={(e) => setShopName(e.target.value)} autoComplete="organization" className={cn(field, 'border-line')} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[12px] font-semibold text-ink-body">Delivery address</span>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} autoComplete="street-address" className={cn(field, 'h-auto py-2.5', errors.address ? 'border-red' : 'border-line')} />
                {err('address')}
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-body">PIN code</span>
                <input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="postal-code" className={cn(field, 'font-mono', errors.pincode ? 'border-red' : 'border-line')} />
                {err('pincode')}
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-body">State</span>
                <select value={state} onChange={(e) => setState(e.target.value)} className={cn(field, 'border-line')}>
                  {STATE_NAMES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[12px] font-semibold text-ink-body">GSTIN (optional, for a GST invoice)</span>
                <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase().slice(0, 15))} className={cn(field, 'font-mono border-line')} />
              </label>
              {/* Bot trap: hidden from people, filled in by spam bots. */}
              <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />
            </div>
          </section>

          <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
            <h2 className="mb-3 text-[14.5px] font-bold text-ink">Delivery and payment</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-body">Date</span>
                <input type="date" value={date} min={props.earliest} onChange={(e) => setDate(e.target.value)} className={cn(field, 'border-line')} />
              </label>
              {props.slots.length > 0 && (
                <label className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-ink-body">Time</span>
                  <select value={slot} onChange={(e) => setSlot(e.target.value)} className={cn(field, 'border-line')}>
                    {props.slots.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-[12px] font-semibold text-ink-body">Pay on delivery by</span>
                <div className="grid grid-cols-2 gap-2">
                  {props.payCod && <PayOption on={payment === 'COD'} onClick={() => setPayment('COD')} title="Cash" />}
                  {props.payUpi && <PayOption on={payment === 'UPI'} onClick={() => setPayment('UPI')} title="UPI" />}
                </div>
              </div>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[12px] font-semibold text-ink-body">Note for the delivery (optional)</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Back gate, call on arrival" className={cn(field, 'border-line')} />
              </label>
            </div>
          </section>
        </div>

        <aside className="grid gap-3 rounded-xl2 border border-line bg-surface p-4 shadow-card lg:sticky lg:top-[84px]">
          <h2 className="text-[14.5px] font-bold text-ink">Your order</h2>
          <ul className="grid gap-2.5">
            {lines.map((l) => (
              <li key={`${l.productId}|${l.unit}`} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{l.name}</div>
                  <div className="text-[11.5px] text-ink-faint">
                    {fmtInr(l.price)}/{l.unit}
                  </div>
                </div>
                <span className="flex items-center rounded-md2 border border-line">
                  <button onClick={() => cart.set(l.productId, l.unit, l.qty - 1)} className="flex h-8 w-8 items-center justify-center text-ink-soft" aria-label={`One less ${l.name}`}>
                    <Minus size={13} />
                  </button>
                  <span className="min-w-[22px] text-center font-mono text-[13px] font-bold">{l.qty}</span>
                  <button onClick={() => cart.set(l.productId, l.unit, l.qty + 1)} className="flex h-8 w-8 items-center justify-center text-ink-soft" aria-label={`One more ${l.name}`}>
                    <Plus size={13} />
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {coupon && quote?.couponCode ? (
            <div className="flex items-center gap-2 rounded-md2 border border-dashed border-green bg-green-soft px-3 py-2 text-[12.5px] font-semibold text-green">
              <TicketPercent size={14} /> <span className="flex-1 font-mono">{quote.couponCode}</span>
              <button onClick={() => (setCoupon(''), setCouponInput(''))} aria-label="Remove coupon">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Coupon code" className={cn(field, 'h-10 border-line font-mono uppercase')} aria-label="Coupon code" />
                <button onClick={() => setCoupon(couponInput.trim())} disabled={!couponInput.trim()} className="h-10 rounded-md2 border border-line px-3 text-[13px] font-bold text-ink disabled:opacity-50">
                  Apply
                </button>
              </div>
              {coupon && quote?.couponError && <p className="mt-1 text-[12px] font-semibold text-red">{quote.couponError}</p>}
            </div>
          )}

          {quote ? (
            <dl className={cn('grid gap-1.5 border-t border-line pt-3 text-[13px]', isFetching && 'opacity-60')}>
              <Row label="Items" value={fmtInr(quote.subtotal)} />
              {quote.autoAmount > 0 && <Row label={quote.autoTitle ?? 'Discount'} value={`− ${fmtInr(quote.autoAmount)}`} green />}
              {quote.couponAmount > 0 && <Row label={`Coupon ${quote.couponCode}`} value={`− ${fmtInr(quote.couponAmount)}`} green />}
              {quote.deliveryWaived > 0 ? <Row label="Delivery" value="Free" green /> : <Row label={`Delivery${quote.zoneName ? ` (${quote.zoneName})` : ''}`} value={quote.deliveryCharge ? fmtInr(quote.deliveryCharge) : props.zones && !/^\d{6}$/.test(pincode) ? 'Enter PIN code' : 'Free'} />}
              <Row label="GST" value={fmtInr(quote.tax)} />
              <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
                <dt className="text-[15px] font-extrabold text-ink">Total</dt>
                <dd className="font-mono text-[19px] font-extrabold tabular-nums text-ink">{fmtInr(quote.total)}</dd>
              </div>
            </dl>
          ) : q?.error ? (
            <p className="text-[12.5px] font-semibold text-red">{q.error}</p>
          ) : (
            <p className="text-[12.5px] text-ink-faint">Working out your total…</p>
          )}

          {quote?.blocker && (
            <p className="flex items-start gap-2 rounded-md2 bg-gold-soft px-3 py-2 text-[12.5px] font-semibold text-ink-body">
              <AlertCircle size={15} className="mt-px flex-shrink-0 text-gold" /> {quote.blocker}
            </p>
          )}
          <button onClick={place} disabled={!canPlace} className="h-12 rounded-md2 bg-brand text-[15px] font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">
            {placing ? 'Placing order…' : quote ? `Place order · ${fmtInr(quote.total)}` : 'Place order'}
          </button>
          <p className="text-center text-[11.5px] text-ink-faint">{props.storeName} confirms your order, then delivers. You pay on delivery.</p>
        </aside>
      </div>
    </div>
  );
}

function PayOption({ on, onClick, title }: { on: boolean; onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn('h-11 rounded-md2 border text-[14px] font-bold', on ? 'border-brand bg-brand-light text-brand-dark' : 'border-line text-ink-soft')}>
      {title}
    </button>
  );
}

function Row({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-ink-soft">{label}</dt>
      <dd className={cn('font-mono tabular-nums', green ? 'text-green' : 'text-ink')}>{value}</dd>
    </div>
  );
}
