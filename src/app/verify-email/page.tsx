import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { verifyEmailToken } from '@/lib/email-verification';
import { BrandMark } from '@/components/shell/brand-mark';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Confirm email — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

const COPY = {
  verified: { ok: true, title: 'Email confirmed', body: 'Thanks — your email address is confirmed.' },
  already: { ok: true, title: 'Already confirmed', body: 'This email address was confirmed earlier. You’re all set.' },
  expired: { ok: false, title: 'This link has expired', body: 'Sign in and use “Resend the link” on the banner to get a new one.' },
  invalid: { ok: false, title: 'This link doesn’t work', body: 'It may have been used already or replaced by a newer one. Sign in to get a new link.' },
} as const;

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const result = await verifyEmailToken(typeof token === 'string' ? token : '');
  const copy = COPY[result];
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[380px] rounded-xl2 border border-line bg-surface p-7 text-center shadow-elevated">
        <BrandMark className="mx-auto mb-3 h-11 w-11 shadow-card" />
        <div className={`mx-auto mb-2 flex justify-center ${copy.ok ? 'text-green' : 'text-red'}`}>{copy.ok ? <CheckCircle2 size={22} /> : <XCircle size={22} />}</div>
        <h1 className="text-[19px] font-extrabold text-ink">{copy.title}</h1>
        <p className="mt-1.5 text-[12.5px] text-ink-faint">{copy.body}</p>
        <Link href="/dashboard" className="mt-5 inline-block text-[12.5px] font-bold text-brand">
          Go to {APP_NAME}
        </Link>
      </div>
    </div>
  );
}
