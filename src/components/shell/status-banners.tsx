'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Eye, MailWarning, CreditCard } from 'lucide-react';
import { stopViewAs } from '@/actions/admin';
import { resendVerificationEmail } from '@/actions/verify-email';
import type { BillingState } from '@/lib/entitlements';

export type BannerProps = {
  viewOnly: { companyName: string } | null;
  unverifiedEmail: string | null;
  billing: { state: BillingState; daysLeft: number | null; isOwner: boolean; planLabel: string } | null;
};

const bar = 'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[12.5px] font-bold print:hidden';

/** The strips across the top of the workspace: viewing as the platform admin,
 * an unconfirmed email, and the subscription running out. */
export function StatusBanners({ viewOnly, unverifiedEmail, billing }: BannerProps) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);

  if (viewOnly) {
    return (
      <div className={`${bar} bg-chrome text-white`}>
        <Eye size={14} /> Viewing {viewOnly.companyName} as the platform admin — read only.
        <button
          type="button"
          disabled={pending}
          className="rounded-sm2 border border-white/30 px-2.5 py-0.5 text-[12px] hover:bg-white/10"
          onClick={() =>
            start(async () => {
              const res = await stopViewAs();
              window.location.href = res.companyId ? `/admin/companies/${res.companyId}` : '/admin';
            })
          }
        >
          Exit
        </button>
      </div>
    );
  }

  return (
    <>
      {billing && (billing.state === 'grace' || billing.state === 'locked' || (billing.state === 'trialing' && billing.daysLeft !== null && billing.daysLeft <= 5)) && (
        <div className={`${bar} ${billing.state === 'locked' ? 'bg-red/10 text-red' : 'bg-gold/15 text-ink'}`}>
          <CreditCard size={14} />
          {billing.state === 'trialing'
            ? `Your free trial ends in ${billing.daysLeft} day${billing.daysLeft === 1 ? '' : 's'}.`
            : billing.state === 'grace'
              ? `Your ${billing.planLabel} plan has run out — new invoices stop in ${billing.daysLeft ?? 0} day${billing.daysLeft === 1 ? '' : 's'}.`
              : 'Your plan has ended — you can view everything, but new invoices are paused.'}
          {billing.isOwner ? (
            <Link href="/billing" className="underline underline-offset-2">
              {billing.state === 'trialing' ? 'Choose a plan' : 'Renew now'}
            </Link>
          ) : (
            <span className="font-normal">Ask the owner to renew.</span>
          )}
        </div>
      )}
      {unverifiedEmail && (
        <div className={`${bar} bg-brand-light text-ink`}>
          <MailWarning size={14} className="text-brand" />
          Confirm your email ({unverifiedEmail}) with the link we sent you.
          <button
            type="button"
            disabled={pending || sent}
            className="text-brand underline underline-offset-2 disabled:no-underline disabled:opacity-60"
            onClick={() =>
              start(async () => {
                const res = await resendVerificationEmail();
                if (res.error) toast.error(res.error);
                else {
                  setSent(true);
                  toast.success('Sent — check your inbox.');
                }
              })
            }
          >
            {sent ? 'Link sent' : 'Resend the link'}
          </button>
        </div>
      )}
    </>
  );
}
