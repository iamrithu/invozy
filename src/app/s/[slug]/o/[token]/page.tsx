import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, CircleX } from 'lucide-react';
import { loadStore } from '@/lib/store-public';
import { verifySignedToken } from '@/lib/signed-token';
import { runWithTenant } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your order', robots: { index: false } };

const STEPS = [
  { key: 'PENDING', label: 'Placed' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PACKED', label: 'Packed' },
  { key: 'OUT_FOR_DELIVERY', label: 'On the way' },
  { key: 'DELIVERED', label: 'Delivered' },
];

/** The private link a web store customer gets for their order. */
export default async function StoreOrderPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const store = await loadStore(slug);
  const v = verifySignedToken('store-order', token);
  if (!store || !v || v.companyId !== store.companyId) {
    return <p className="py-16 text-center text-[14px] text-ink-soft">This order link isn’t valid any more.</p>;
  }
  // Awaited inside the scope: a Prisma query only runs when awaited, and the
  // company scope must still be set at that moment.
  const order = await runWithTenant(store.companyId, async () => await prisma.order.findUnique({ where: { id: v.id }, include: { items: { orderBy: { sortOrder: 'asc' } } } }));
  if (!order) return <p className="py-16 text-center text-[14px] text-ink-soft">This order no longer exists.</p>;
  const rank = STEPS.findIndex((s) => s.key === order.status);
  const cancelled = order.status === 'CANCELLED';
  const tax = Number(order.cgst) + Number(order.sgst) + Number(order.igst);

  return (
    <div className="mx-auto max-w-[620px] pb-10">
      <div className="rounded-xl2 border border-line bg-surface p-5 shadow-card">
        <p className="text-[12.5px] font-semibold text-ink-faint">Order</p>
        <h1 className="font-mono text-[22px] font-extrabold text-ink">{order.number}</h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          {cancelled
            ? `Cancelled. ${order.cancelReason ?? ''}`
            : order.status === 'PENDING'
              ? `Thanks! ${store.name} will confirm your order shortly.`
              : order.status === 'DELIVERED'
                ? 'Delivered. Thank you!'
                : `${store.name} is on it.`}
        </p>
        {!cancelled ? (
          <ol className="mt-5 grid grid-cols-5 gap-1">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex flex-col items-center gap-1.5 text-center">
                <span className={cn('flex h-7 w-7 items-center justify-center rounded-full border-2', i <= rank ? 'border-green bg-green text-white' : 'border-line bg-surface')}>{i <= rank && <Check size={14} strokeWidth={3} />}</span>
                <span className={cn('text-[11px] font-semibold leading-tight', i <= rank ? 'text-ink' : 'text-ink-faint')}>{s.label}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-brand-dark">
            <CircleX size={16} /> This order was cancelled.
          </p>
        )}
        <dl className="mt-5 grid gap-1 border-t border-line pt-4 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Delivery</dt>
            <dd className="text-right text-ink">{[order.deliveryDate?.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }), order.deliverySlot].filter(Boolean).join(', ')}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">To</dt>
            <dd className="text-right text-ink">{[order.shipName, order.shipAddress, order.shipPincode].filter(Boolean).join(', ')}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Payment</dt>
            <dd className="text-ink">{order.paymentMethod === 'UPI' ? 'UPI on delivery' : 'Cash on delivery'}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 rounded-xl2 border border-line bg-surface p-5 shadow-card">
        <ul className="grid gap-2 text-[13px]">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span className="text-ink">
                {i.name} <span className="text-ink-faint">× {Number(i.qty)} {i.unit}</span>
              </span>
              <span className="font-mono text-ink">{fmtInr(Number(i.qty) * Number(i.rate))}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid gap-1 border-t border-line pt-3 text-[13px]">
          {Number(order.autoDiscount) + Number(order.couponDiscount) > 0 && (
            <div className="flex justify-between text-green">
              <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</dt>
              <dd className="font-mono">− {fmtInr(Number(order.autoDiscount) + Number(order.couponDiscount))}</dd>
            </div>
          )}
          {Number(order.deliveryCharge) > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">Delivery</dt>
              <dd className="font-mono">{fmtInr(Number(order.deliveryCharge))}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-soft">GST</dt>
            <dd className="font-mono">{fmtInr(tax)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-[15px] font-extrabold text-ink">
            <dt>Total</dt>
            <dd className="font-mono">{fmtInr(Number(order.total))}</dd>
          </div>
        </dl>
      </div>
      <p className="mt-4 text-center text-[12px] text-ink-faint">
        Keep this page’s link to check your order. <Link href={`/s/${slug}`} className="font-semibold text-brand">Order again</Link>
      </p>
    </div>
  );
}
