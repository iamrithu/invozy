'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CreditCard, Check, AlertTriangle, Receipt, Users, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { fmtInr } from '@/lib/gst';
import { moduleInfo, isModuleKey } from '@/lib/modules';
import { cancelCompanyDeletion, confirmCheckout, requestCompanyDeletion, startCheckout, type BillingOverview } from '@/actions/subscription';

type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };

/** Loads Razorpay Checkout once (https://checkout.razorpay.com/v1/checkout.js). */
function loadRazorpay(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Payment window failed to load.')));
    script.onerror = () => reject(new Error('Couldn’t reach the payment provider. Check your connection.'));
    document.body.appendChild(script);
  });
}

const STATE_COPY: Record<BillingOverview['state'], { label: string; variant: 'green' | 'gold' | 'red' | 'brand' }> = {
  trialing: { label: 'Free trial', variant: 'brand' },
  active: { label: 'Active', variant: 'green' },
  grace: { label: 'Payment due', variant: 'gold' },
  locked: { label: 'Ended', variant: 'red' },
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function BillingClient({ initial, viewOnly }: { initial: BillingOverview; viewOnly: boolean }) {
  const router = useRouter();
  const b = initial;
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [paying, setPaying] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [pending, startTransition] = useTransition();
  const state = STATE_COPY[b.state];

  async function pay(planKey: string) {
    setPaying(planKey);
    try {
      const res = await startCheckout(planKey, cycle);
      if (res.error || !res.checkout) throw new Error(res.error ?? 'Couldn’t start the payment.');
      const c = res.checkout;
      const Razorpay = await loadRazorpay();
      await new Promise<void>((resolve) => {
        const rz = new Razorpay({
          key: c.keyId,
          order_id: c.orderId,
          amount: c.amountPaise,
          currency: 'INR',
          name: c.companyName,
          description: c.description,
          prefill: c.email ? { email: c.email } : undefined,
          theme: { color: '#E23645' },
          modal: { ondismiss: () => resolve() },
          handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            const done = await confirmCheckout({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
            if (done.error) toast.error(done.error);
            else toast.success('Payment received — thank you!');
            router.refresh();
            resolve();
          },
        });
        rz.on('payment.failed', () => {
          toast.error('The payment didn’t go through. You haven’t been charged — try again.');
          resolve();
        });
        rz.open();
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t start the payment.');
    } finally {
      setPaying(null);
    }
  }

  function runDeletion(action: 'request' | 'cancel') {
    startTransition(async () => {
      const res = action === 'request' ? await requestCompanyDeletion(confirmName) : await cancelCompanyDeletion();
      if (res.error) toast.error(res.error);
      else toast.success(action === 'request' ? 'Deletion requested — we’ll be in touch before anything is removed.' : 'Deletion request withdrawn.');
      setConfirmName('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 data-tour="billing-plan" className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
          <CreditCard size={18} className="text-brand" /> Billing &amp; plan
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">Your plan, what you’ve used this month, and payments.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Current plan</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[19px] font-extrabold text-ink">{b.plan.label}</span>
            <Badge variant={state.variant}>{state.label}</Badge>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-soft">
            {b.complimentary
              ? 'No renewal needed.'
              : b.state === 'trialing'
                ? `Trial ends ${fmtDate(b.endsAt)}${b.daysLeft !== null ? ` — ${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'} left` : ''}. Every module is included while you try it.`
                : b.state === 'active'
                  ? `Paid until ${fmtDate(b.endsAt)}.`
                  : b.state === 'grace'
                    ? `Ended ${fmtDate(b.endsAt)}. Pay within ${b.daysLeft ?? 0} day${b.daysLeft === 1 ? '' : 's'} to keep adding invoices.`
                    : 'Renew to add new invoices again. Everything you entered is still here.'}
          </p>
        </div>
        <Meter icon={<Receipt size={13} />} label="Invoices this month" used={b.usage.invoicesThisMonth} max={b.usage.maxInvoicesPerMonth} />
        <Meter icon={<Users size={13} />} label="Active logins" used={b.usage.activeLogins} max={b.usage.maxUsers} />
      </div>

      {(b.state === 'grace' || b.state === 'locked') && (
        <div className="flex items-start gap-2 rounded-lg2 border border-gold/40 bg-gold/10 p-3 text-[12.5px] text-ink">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-gold" />
          {b.state === 'grace' ? 'Your plan has run out. Billing keeps working for now — pay below so nothing stops.' : 'Your plan has ended, so new invoices, customers and products can’t be added. Viewing, payments and exports still work.'}
        </div>
      )}

      <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-ink-soft">Plans</div>
          <div className="flex rounded-md2 border border-line bg-bg p-0.5">
            {(['monthly', 'yearly'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={clsx('rounded-sm2 px-3 py-1 text-[12px] font-bold', cycle === c ? 'bg-brand-light text-brand' : 'text-ink-soft hover:text-ink')}
              >
                {c === 'monthly' ? 'Monthly' : 'Yearly · 2 months free'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {b.plans.map((p) => {
            const current = p.key === b.plan.key && b.state !== 'trialing';
            const price = cycle === 'yearly' ? p.yearly : p.monthly;
            return (
              <div key={p.key} className={clsx('flex flex-col rounded-lg2 border p-4', current ? 'border-brand bg-brand-light/40' : 'border-line bg-bg')}>
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-extrabold text-ink">{p.label}</span>
                  {current && <Badge variant="brand">Your plan</Badge>}
                </div>
                <div className="mt-1 font-mono text-[20px] font-extrabold text-ink">
                  {fmtInr(price)}
                  <span className="text-[11px] font-bold text-ink-faint"> / {cycle === 'yearly' ? 'year' : 'month'}</span>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-soft">{p.blurb}</p>
                <ul className="mt-2 flex-1 space-y-1 text-[11.5px] text-ink-soft">
                  <li className="flex gap-1.5">
                    <Check size={12} className="mt-0.5 text-green" /> {p.maxInvoicesPerMonth === null ? 'Unlimited invoices' : `${p.maxInvoicesPerMonth.toLocaleString('en-IN')} invoices a month`}
                  </li>
                  <li className="flex gap-1.5">
                    <Check size={12} className="mt-0.5 text-green" /> {p.maxUsers === null ? 'Unlimited logins' : `${p.maxUsers} logins`}
                  </li>
                  {p.modules.filter(isModuleKey).map((m) => (
                    <li key={m} className="flex gap-1.5">
                      <Check size={12} className="mt-0.5 text-green" /> {moduleInfo(m).label}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  className="mt-3 w-full justify-center"
                  variant={current ? 'outline' : undefined}
                  disabled={!b.onlinePayment || viewOnly || paying !== null}
                  onClick={() => pay(p.key)}
                >
                  {paying === p.key ? 'Opening payment…' : current ? `Renew ${cycle === 'yearly' ? 'for a year' : 'for a month'}` : `Choose ${p.label}`}
                </Button>
              </div>
            );
          })}
        </div>
        {!b.onlinePayment && <p className="mt-3 text-[12px] text-ink-faint">Online payment isn’t set up yet — contact support to change or renew your plan.</p>}
      </div>

      <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
        <div className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-ink-soft">Payments</div>
        {b.payments.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-ink-faint">No payments yet.</p>
        ) : (
          <div className="divide-y divide-dashed divide-line">
            {b.payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
                <span className="min-w-0 flex-1 font-bold text-ink">
                  {p.plan.charAt(0).toUpperCase() + p.plan.slice(1)} · {p.months === 12 ? '1 year' : `${p.months} month${p.months === 1 ? '' : 's'}`}
                </span>
                <span className="text-ink-faint">{p.periodStart ? `${fmtDate(p.periodStart)} – ${fmtDate(p.periodEnd)}` : fmtDate(p.createdAt)}</span>
                <Badge variant={p.status === 'paid' ? 'green' : 'red'}>{p.status === 'paid' ? 'Paid' : 'Failed'}</Badge>
                <span className="font-mono font-bold text-ink">{fmtInr(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl2 border border-red/30 bg-surface p-4 shadow-card">
        <div className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-red">Close your account</div>
        {b.deletionRequestedAt ? (
          <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-soft">
            <span>You asked on {fmtDate(b.deletionRequestedAt)} for {b.companyName} and all its data to be deleted. We’ll confirm with you before anything is removed.</span>
            <Button type="button" variant="outline" size="sm" disabled={pending || viewOnly} onClick={() => runDeletion('cancel')}>
              <Undo2 size={12} /> Keep my account
            </Button>
          </div>
        ) : (
          <>
            <p className="text-[12.5px] text-ink-soft">
              Download a backup first (Reports → Export → Backup). Deleting removes every invoice, customer, product and login of {b.companyName} for good.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={`Type “${b.companyName}” to confirm`} className="max-w-[300px]" />
              <Button type="button" variant="outline" disabled={pending || viewOnly || confirmName.trim().toLowerCase() !== b.companyName.trim().toLowerCase()} onClick={() => runDeletion('request')}>
                <Trash2 size={12} /> Ask to delete everything
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Meter({ icon, label, used, max }: { icon: React.ReactNode; label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        {icon} {label}
      </div>
      <div className="mt-1 font-mono text-[19px] font-extrabold text-ink">
        {used.toLocaleString('en-IN')}
        <span className="text-[12px] font-bold text-ink-faint"> / {max === null ? 'unlimited' : max.toLocaleString('en-IN')}</span>
      </div>
      {max !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt">
          <div className={clsx('h-full rounded-full', pct >= 90 ? 'bg-red' : pct >= 70 ? 'bg-gold' : 'bg-green')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
