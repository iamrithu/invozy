'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, ChevronLeft, CircleCheck, Info, PackageCheck, Pencil, Receipt, Trash2, Truck, Undo2, Wallet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { InvoiceTrigger, OrderStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { selectClass } from '@/components/ui/form-sheet';
import { ChannelTag, OrderStatusPill, PAYMENT_LABEL, orderWhen } from '@/components/orders/order-meta';
import { useCurrentUser } from '@/components/current-user';
import { useOrder, useOrderAction } from '@/hooks/use-orders';
import type { OrderView } from '@/actions/orders';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'PENDING', label: 'Placed' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'PACKED', label: 'Packed' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { status: 'DELIVERED', label: 'Delivered' },
];
const RANK: Record<OrderStatus, number> = { DRAFT: -1, PENDING: 0, CONFIRMED: 1, PACKED: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4, CANCELLED: -1 };

type Dialog = null | 'dispatch' | 'deliver' | 'cancel' | 'delete';

export function OrderDetailClient({ initial, trigger, triggerNote }: { initial: OrderView; trigger: InvoiceTrigger; triggerNote: string }) {
  const router = useRouter();
  const me = useCurrentUser();
  const { data } = useOrder(initial.id, initial);
  const o = data ?? initial;
  const action = useOrderAction();
  const [dialog, setDialog] = useState<Dialog>(null);

  /** Runs an action; a short-stock refusal offers the owner "Save anyway". */
  async function run(v: Parameters<typeof action.mutateAsync>[0], success: (r: { invoiceNumber?: string }) => string) {
    try {
      const r = await action.mutateAsync(v);
      toast.success(success(r));
      if (r.warning) toast.warning(r.warning, { duration: 8000 });
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      const canForce = me.isOwner && /stock/i.test(msg) && (v.kind === 'invoice' || v.kind === 'dispatch');
      toast.error(msg, canForce ? { duration: 12000, action: { label: 'Save anyway', onClick: () => void run({ ...v, allowNegativeStock: true } as typeof v, success) } } : undefined);
      return false;
    }
  }

  const rank = RANK[o.status];
  const triggerStep: OrderStatus | null = trigger === 'ON_CONFIRM' ? 'CONFIRMED' : trigger === 'ON_DISPATCH' ? 'OUT_FOR_DELIVERY' : null;
  const editable = !o.invoice && ['DRAFT', 'PENDING', 'CONFIRMED', 'PACKED'].includes(o.status);
  const canInvoice = !o.invoice && ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status);
  const balance = o.invoice ? Math.max(o.invoice.total - o.invoice.amountPaid, 0) : 0;
  const placed = o.source === 'WEB' ? `Placed ${orderWhen(o.createdAt)} on the web store` : `Created ${orderWhen(o.createdAt)}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/orders" className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-faint hover:text-ink">
            <ChevronLeft size={14} /> Orders
          </Link>
          <h1 className="flex flex-wrap items-center gap-2.5 text-[16px] font-extrabold text-ink sm:text-[17px]">
            <span className="font-mono">{o.number}</span>
            <OrderStatusPill status={o.status} />
            <ChannelTag channel={o.channel} />
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">{placed}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button variant="outline" asChild>
              <Link href={`/orders/${o.id}/edit`}>
                <Pencil size={13} /> Edit
              </Link>
            </Button>
          )}
          {o.status === 'DRAFT' && (
            <Button variant="ghost" className="text-red" onClick={() => setDialog('delete')}>
              <Trash2 size={13} /> Delete draft
            </Button>
          )}
          {['PENDING', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'].includes(o.status) && !o.invoice && (
            <Button variant="ghost" className="text-red" onClick={() => setDialog('cancel')}>
              <XCircle size={13} /> Cancel
            </Button>
          )}
          {canInvoice && o.status !== 'DELIVERED' && (
            <Button variant="outline" disabled={action.isPending} onClick={() => run({ kind: 'invoice', id: o.id }, (r) => `Invoice ${r.invoiceNumber ?? ''} generated`)}>
              <Receipt size={13} /> Generate invoice
            </Button>
          )}
          {(o.status === 'DRAFT' || o.status === 'PENDING') && (
            <Button disabled={action.isPending} onClick={() => run({ kind: 'confirm', id: o.id }, (r) => (r.invoiceNumber ? `Confirmed and invoiced as ${r.invoiceNumber}` : `${o.number} confirmed`))}>
              <CircleCheck size={13} /> Confirm order
            </Button>
          )}
          {o.status === 'CONFIRMED' && (
            <Button disabled={action.isPending} onClick={() => run({ kind: 'pack', id: o.id }, () => `${o.number} packed`)}>
              <PackageCheck size={13} /> Mark packed
            </Button>
          )}
          {(o.status === 'CONFIRMED' || o.status === 'PACKED') && (
            <Button variant={o.status === 'PACKED' ? 'default' : 'outline'} onClick={() => setDialog('dispatch')}>
              <Truck size={13} /> Dispatch
            </Button>
          )}
          {o.status === 'OUT_FOR_DELIVERY' && (
            <Button onClick={() => setDialog('deliver')}>
              <Check size={13} /> Mark delivered
            </Button>
          )}
          {o.status === 'DELIVERED' && canInvoice && (
            <Button disabled={action.isPending} onClick={() => run({ kind: 'invoice', id: o.id }, (r) => `Invoice ${r.invoiceNumber ?? ''} generated`)}>
              <Receipt size={13} /> Generate invoice
            </Button>
          )}
          {o.status === 'DELIVERED' && o.invoice && (
            <Button variant="outline" asChild>
              <Link href={`/credit-notes/new?invoice=${o.invoice.id}`}>
                <Undo2 size={13} /> Start a return
              </Link>
            </Button>
          )}
        </div>
      </div>

      {o.status === 'CANCELLED' && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl2 border border-brand/30 bg-brand-light px-4 py-3 text-[13px] text-brand-dark">
          <XCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <b>Cancelled.</b> {o.cancelReason}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
        <div className="grid min-w-0 gap-4">
          {o.status !== 'CANCELLED' && o.status !== 'DRAFT' && (
            <section className="overflow-x-auto rounded-xl2 border border-line bg-surface px-4 py-4 shadow-card sm:px-5">
              <ol className="flex min-w-[520px]">
                {STEPS.map((s, i) => {
                  const done = i < rank || (i === rank && s.status === 'DELIVERED');
                  const current = i === rank && !done;
                  return (
                    <li key={s.status} className="relative flex flex-1 flex-col items-start gap-1.5">
                      {i < STEPS.length - 1 && <span aria-hidden className={cn('absolute left-7 right-1 top-[11px] h-0.5', i < rank ? 'bg-green' : 'bg-line')} />}
                      <span
                        className={cn(
                          'relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-surface',
                          done ? 'border-green bg-green text-white' : current ? 'border-brand shadow-[0_0_0_4px_hsl(var(--brand-light))]' : 'border-line'
                        )}
                      >
                        {done && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className={cn('text-[12px] font-bold', i <= rank ? 'text-ink' : 'text-ink-faint')}>{s.label}</span>
                      {triggerStep === s.status && <span className="rounded-sm2 bg-brand-light px-1.5 text-[10px] font-bold text-brand-dark">Invoice here</span>}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <section className="rounded-xl2 border border-line bg-surface shadow-card">
            <div className="flex items-baseline justify-between border-b border-line px-4 py-3 sm:px-5">
              <h2 className="text-[13.5px] font-bold text-ink">Items</h2>
              <span className="text-[11.5px] text-ink-faint">
                {o.items.length} line{o.items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-2 sm:px-5">Item</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Rate</th>
                    <th className="px-2 py-2 text-right">Disc</th>
                    <th className="px-4 py-2 text-right sm:px-5">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {o.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-2.5 sm:px-5">
                        <div className="font-semibold text-ink">{i.name}</div>
                        {i.category && <div className="text-[11px] text-ink-faint">{i.category}</div>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono tabular-nums">
                        {i.qty} {i.unit}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">{fmtInr(i.rate)}</td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-ink-soft">{i.discount ? `${i.discount}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-ink sm:px-5">{fmtInr(i.qty * i.rate * (1 - i.discount / 100))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-line px-4 py-3 sm:px-5">
              <dl className="grid w-full max-w-[340px] gap-1.5 text-[12.5px]">
                <Total label="Items" value={o.subtotal} />
                {o.autoDiscount > 0 && <Total label={`${o.autoDiscountLabel ?? 'Automatic'} discount`} value={-o.autoDiscount} green />}
                {o.couponDiscount > 0 && <Total label={`Coupon ${o.couponCode}`} value={-o.couponDiscount} green />}
                {o.couponCode && o.couponDiscount === 0 && <div className="flex justify-between text-green"><dt>Coupon {o.couponCode}</dt><dd>Free delivery</dd></div>}
                {o.deliveryCharge > 0 && <Total label="Delivery" value={o.deliveryCharge} />}
                <Total label="Taxable value" value={o.taxable} strong />
                {o.interState ? (
                  <Total label="IGST" value={o.igst} />
                ) : (
                  <>
                    <Total label="CGST" value={o.cgst} />
                    <Total label="SGST" value={o.sgst} />
                  </>
                )}
                <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
                  <dt className="text-[14px] font-extrabold text-ink">Total</dt>
                  <dd className="font-mono text-[17px] font-extrabold tabular-nums text-ink">{fmtInr(o.total)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card sm:p-5">
            <h2 className="mb-3 text-[13.5px] font-bold text-ink">Timeline</h2>
            <ol className="grid gap-3.5">
              {o.events.map((e, i) => (
                <li key={e.id} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2.5">
                  <span className={cn('mt-0.5 h-[22px] w-[22px] rounded-full border-2', i === 0 ? 'border-brand bg-brand-light' : 'border-line bg-surface')} aria-hidden />
                  <div>
                    <div className="text-[13px] text-ink">{e.message}</div>
                    <div className="text-[11.5px] text-ink-faint">{orderWhen(e.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="grid gap-4">
          <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
            <h2 className="mb-2.5 text-[13.5px] font-bold text-ink">Invoice</h2>
            {o.invoice ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/invoices/${o.invoice.id}`} className="font-mono text-[13px] font-bold text-ink hover:text-brand">
                    {o.invoice.number}
                  </Link>
                  <span className={cn('rounded-sm2 px-2 py-0.5 text-[11px] font-bold', o.invoice.status === 'PAID' ? 'bg-green-soft text-green' : 'bg-gold-soft text-ink-body')}>
                    {o.invoice.status === 'PAID' ? 'Paid' : o.invoice.status === 'PARTIALLY_PAID' ? 'Part paid' : 'Unpaid'}
                  </span>
                </div>
                <p className="text-[12px] text-ink-faint">
                  {fmtInr(o.invoice.total)}
                  {balance > 0 ? ` · ${fmtInr(balance)} due` : ''}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/invoices/${o.invoice.id}`}>
                    <Receipt size={13} /> Open invoice
                  </Link>
                </Button>
              </div>
            ) : o.status === 'CANCELLED' ? (
              <p className="text-[12.5px] text-ink-soft">No invoice. Cancelled before invoicing, so no GST invoice number was used.</p>
            ) : (
              <div className="grid gap-2">
                <p className="text-[12.5px] font-semibold text-ink">No invoice yet</p>
                <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-faint">
                  <Info size={13} className="mt-0.5 flex-shrink-0" /> {triggerNote}
                </p>
                {!canInvoice && <p className="text-[11.5px] text-ink-faint">Confirm the order first.</p>}
              </div>
            )}
          </section>

          <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
            <h2 className="mb-2.5 text-[13.5px] font-bold text-ink">Customer</h2>
            <dl className="grid gap-1.5 text-[12.5px]">
              <Kv label="Name" value={<Link href={`/customers?open=${o.customer.id}`} className="font-bold text-ink hover:text-brand">{o.customer.shopName || o.customer.name}</Link>} />
              {o.customer.phone && <Kv label="Phone" value={o.customer.phone} />}
              <Kv label="GSTIN" value={<span className="font-mono">{o.customer.gstin || 'Unregistered'}</span>} />
              <Kv label="Terms" value={o.customer.terms} />
            </dl>
          </section>

          <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
            <h2 className="mb-2.5 text-[13.5px] font-bold text-ink">Delivery and payment</h2>
            <dl className="grid gap-1.5 text-[12.5px]">
              <Kv label="When" value={[o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : null, o.deliverySlot].filter(Boolean).join(', ') || 'Any time'} />
              {o.shipAddress && <Kv label="Address" value={o.shipAddress} />}
              {o.customer.route && <Kv label="Route" value={o.customer.route} />}
              {o.vehicleNo && <Kv label="Vehicle" value={<span className="font-mono">{o.vehicleNo}</span>} />}
              {o.driverName && <Kv label="Driver" value={[o.driverName, o.driverPhone].filter(Boolean).join(' · ')} />}
              <Kv label="Payment" value={PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod} />
              {o.notes && <Kv label="Notes" value={o.notes} />}
            </dl>
          </section>
        </div>
      </div>

      <DispatchDialog open={dialog === 'dispatch'} order={o} trigger={trigger} onClose={() => setDialog(null)} run={run} />
      <DeliverDialog open={dialog === 'deliver'} order={o} balance={balance} onClose={() => setDialog(null)} run={run} />
      <CancelDialog open={dialog === 'cancel'} order={o} onClose={() => setDialog(null)} run={run} />
      <Dialog open={dialog === 'delete'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete draft {o.number}?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-ink-soft">The draft is removed. Its order number isn’t reused.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={action.isPending}
              onClick={async () => {
                if (await run({ kind: 'delete', id: o.id }, () => 'Draft deleted')) router.push('/orders');
              }}
            >
              Delete draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Run = (v: Parameters<ReturnType<typeof useOrderAction>['mutateAsync']>[0], success: (r: { invoiceNumber?: string }) => string) => Promise<boolean>;

function DispatchDialog({ open, order, trigger, onClose, run }: { open: boolean; order: OrderView; trigger: InvoiceTrigger; onClose: () => void; run: Run }) {
  const [vehicleNo, setVehicleNo] = useState(order.vehicleNo ?? '');
  const [driverName, setDriverName] = useState(order.driverName ?? '');
  const [driverPhone, setDriverPhone] = useState(order.driverPhone ?? '');
  const [makeInvoice, setMakeInvoice] = useState(true);
  const [busy, setBusy] = useState(false);
  const auto = !order.invoice && trigger === 'ON_DISPATCH';
  const ask = !order.invoice && trigger !== 'ON_DISPATCH';
  async function go() {
    setBusy(true);
    const ok = await run({ kind: 'dispatch', id: order.id, vehicleNo, driverName, driverPhone, generateInvoice: ask && makeInvoice }, (r) => (r.invoiceNumber ? `${order.number} dispatched with invoice ${r.invoiceNumber}` : `${order.number} is out for delivery`));
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Dispatch {order.number}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Vehicle number</span>
              <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} placeholder="TN 37 BX 4410" className="font-mono" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Driver</span>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Name" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-body">Driver’s phone</span>
              <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} inputMode="tel" placeholder="Optional" />
            </label>
          </div>
          {auto && (
            <p className="flex items-start gap-2 rounded-md2 bg-bg px-3 py-2 text-[12px] text-ink-soft">
              <Receipt size={14} className="mt-0.5 flex-shrink-0" /> The GST invoice is generated now, with the vehicle and driver on it.
            </p>
          )}
          {ask && (
            <label className="flex items-start gap-2 text-[12.5px] text-ink-body">
              <input type="checkbox" checked={makeInvoice} onChange={(e) => setMakeInvoice(e.target.checked)} className="mt-0.5 accent-[hsl(var(--brand))]" />
              Generate the invoice now. GST expects the invoice by the time the goods leave.
            </label>
          )}
          {order.invoice && <p className="text-[12px] text-ink-faint">The vehicle and driver are added to {order.invoice.number}.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={go} disabled={busy}>
            <Truck size={13} /> Dispatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliverDialog({ open, order, balance, onClose, run }: { open: boolean; order: OrderView; balance: number; onClose: () => void; run: Run }) {
  const collectable = !!order.invoice && balance > 0 && order.paymentMethod !== 'CREDIT';
  const [collected, setCollected] = useState(true);
  const [mode, setMode] = useState(order.paymentMethod === 'UPI' ? 'UPI' : 'Cash');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const ok = await run({ kind: 'deliver', id: order.id, collected: collectable && collected, mode }, () => `${order.number} delivered`);
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Mark {order.number} delivered</DialogTitle>
        </DialogHeader>
        {collectable ? (
          <div className="grid gap-3">
            <label className="flex items-start gap-2 text-[13px] text-ink-body">
              <input type="checkbox" checked={collected} onChange={(e) => setCollected(e.target.checked)} className="mt-0.5 accent-[hsl(var(--brand))]" />
              <span>
                Collected <b className="font-mono">{fmtInr(balance)}</b> on delivery
              </span>
            </label>
            {collected && (
              <select value={mode} onChange={(e) => setMode(e.target.value)} className={selectClass} aria-label="Paid by">
                {['Cash', 'UPI', 'Card', 'Cheque'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            )}
            <p className="text-[11.5px] text-ink-faint">Records a payment and receipt on {order.invoice!.number}.</p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-soft">{order.invoice ? (balance > 0 ? 'On credit: the invoice stays open until it’s paid.' : 'Already paid.') : 'There’s no invoice yet, so no payment is recorded.'}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={go} disabled={busy}>
            {collectable && collected ? <Wallet size={13} /> : <Check size={13} />} Mark delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CANCEL_REASONS = ['Customer cancelled', 'Out of stock', 'Duplicate order', 'Couldn’t deliver to the address', 'Payment didn’t come through', 'Other'];

function CancelDialog({ open, order, onClose, run }: { open: boolean; order: OrderView; onClose: () => void; run: Run }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const ok = await run({ kind: 'cancel', id: order.id, reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason }, () => `${order.number} cancelled`);
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Cancel {order.number}?</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={selectClass} aria-label="Reason">
            {CANCEL_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <Input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Add a note (optional)" maxLength={150} />
          <p className="text-[12px] text-ink-faint">No invoice exists, so no GST document is needed.{order.couponCode ? ` The ${order.couponCode} use is given back.` : ''}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep order
          </Button>
          <Button variant="destructive" onClick={go} disabled={busy}>
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Total({ label, value, green, strong }: { label: string; value: number; green?: boolean; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', strong && 'border-t border-dashed border-line pt-1.5')}>
      <dt className={strong ? 'font-bold text-ink' : 'text-ink-soft'}>{label}</dt>
      <dd className={cn('font-mono tabular-nums', green ? 'text-green' : 'text-ink', strong && 'font-bold')}>{value < 0 ? `− ${fmtInr(-value)}` : fmtInr(value)}</dd>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="break-words text-ink">{value}</dd>
    </div>
  );
}
