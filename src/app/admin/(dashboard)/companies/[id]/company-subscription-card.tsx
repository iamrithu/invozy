'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, CalendarPlus, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { fmtInr } from '@/lib/gst';
import { PLANS, PLAN_KEYS } from '@/lib/plans';
import type { AdminCompanyDetail } from '@/actions/admin';
import { useExtendTrial, useRecordPayment, useSetCompanySubscription } from '@/hooks/use-admin';

const selectClass = 'h-9 rounded-md2 border border-line bg-surface px-2 text-[12.5px] text-ink';
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const STATE_BADGE = { trialing: ['brand', 'Trial'], active: ['green', 'Active'], grace: ['gold', 'Payment due'], locked: ['red', 'Ended'] } as const;

/** Plan, status, trial and payments for one company (platform admin). */
export function CompanySubscriptionCard({ company }: { company: AdminCompanyDetail }) {
  const sub = company.subscription;
  const [plan, setPlan] = useState(company.plan);
  const [status, setStatus] = useState(company.subscriptionStatus);
  const [periodEnd, setPeriodEnd] = useState(company.currentPeriodEnd ? company.currentPeriodEnd.slice(0, 10) : '');
  const [pay, setPay] = useState({ plan: company.plan, months: '12', amount: String(PLANS[company.plan as keyof typeof PLANS]?.yearly ?? ''), note: '' });
  const save = useSetCompanySubscription();
  const extend = useExtendTrial();
  const record = useRecordPayment();
  const [badgeVariant, badgeLabel] = STATE_BADGE[sub.state];

  async function run(p: Promise<{ error?: string }>, ok: string) {
    const res = await p;
    if (res.error) toast.error(res.error);
    else toast.success(ok);
  }

  return (
    <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card lg:col-span-2">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">
        <CreditCard size={13} /> Subscription
        <Badge variant={badgeVariant}>
          {sub.planLabel} · {badgeLabel}
        </Badge>
      </div>
      <p className="mb-3 text-[12px] text-ink-faint">
        {sub.endsAt
          ? `${sub.state === 'trialing' ? 'Trial ends' : sub.state === 'active' ? 'Paid until' : 'Ended'} ${fmtDate(sub.endsAt)}${sub.state === 'grace' && sub.graceEndsAt ? ` — new invoices stop ${fmtDate(sub.graceEndsAt)}` : ''}.`
          : sub.state === 'active'
            ? 'Complimentary — no end date.'
            : sub.state === 'locked'
              ? 'Cancelled.'
              : 'No end date.'}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-2 rounded-lg2 border border-line bg-bg p-3">
          <div className="text-[12px] font-bold text-ink">Plan &amp; status</div>
          <div className="flex flex-wrap gap-2">
            <select className={selectClass} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
              {PLAN_KEYS.map((k) => (
                <option key={k} value={k}>
                  {PLANS[k].label}
                </option>
              ))}
            </select>
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
              <option value="TRIALING">Trial</option>
              <option value="ACTIVE">Active</option>
              <option value="PAST_DUE">Past due</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {(status === 'ACTIVE' || status === 'PAST_DUE') && (
            <label className="block text-[11.5px] text-ink-soft">
              Paid until (blank = no end date)
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1" />
            </label>
          )}
          <Button type="button" size="sm" disabled={save.isPending} onClick={() => run(save.mutateAsync({ companyId: company.id, plan, status, periodEnd: periodEnd || null }), 'Subscription saved')}>
            Save
          </Button>
        </div>

        <div className="space-y-2 rounded-lg2 border border-line bg-bg p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
            <CalendarPlus size={13} /> Extend the trial
          </div>
          <p className="text-[11.5px] text-ink-faint">Puts the company back on trial, every module included.</p>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((d) => (
              <Button key={d} type="button" size="sm" variant="outline" disabled={extend.isPending} onClick={() => run(extend.mutateAsync({ companyId: company.id, days: d }), `Trial extended by ${d} days`)}>
                +{d} days
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-lg2 border border-line bg-bg p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
            <IndianRupee size={13} /> Record a payment
          </div>
          <div className="flex flex-wrap gap-2">
            <select className={selectClass} value={pay.plan} onChange={(e) => setPay({ ...pay, plan: e.target.value })} aria-label="Paid plan">
              {PLAN_KEYS.map((k) => (
                <option key={k} value={k}>
                  {PLANS[k].label}
                </option>
              ))}
            </select>
            <Input value={pay.months} onChange={(e) => setPay({ ...pay, months: e.target.value })} className="w-[80px]" placeholder="Months" aria-label="Months" />
            <Input value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="w-[110px]" placeholder="Amount ₹" aria-label="Amount" />
          </div>
          <Input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Note (UTR, cheque no.)" aria-label="Note" />
          <Button
            type="button"
            size="sm"
            disabled={record.isPending}
            onClick={() => run(record.mutateAsync({ companyId: company.id, plan: pay.plan, months: Number(pay.months), amount: Number(pay.amount), note: pay.note }), 'Payment recorded')}
          >
            Record payment
          </Button>
        </div>
      </div>

      {company.payments.length > 0 && (
        <div className="mt-3 divide-y divide-dashed divide-line">
          {company.payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 py-1.5 text-[12px]">
              <span className="min-w-0 flex-1 font-bold text-ink">
                {PLANS[p.plan as keyof typeof PLANS]?.label ?? p.plan} · {p.months} mo · {p.provider === 'manual' ? `recorded by ${p.recordedBy ?? 'admin'}` : 'Razorpay'}
                {p.note ? ` · ${p.note}` : ''}
              </span>
              <span className="text-ink-faint">
                {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
              </span>
              <span className="font-mono font-bold text-ink">{fmtInr(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
