import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { APP_NAME } from '@/lib/brand';
import { BrandMark } from '@/components/shell/brand-mark';
import { SignupClient } from './signup-client';

export const metadata: Metadata = { title: `Sign up — ${APP_NAME}` };

export default async function SignupPage() {
  // Already signed in to a company — straight to it.
  if (await requireUser().catch(() => null)) redirect('/dashboard');

  // SIGNUPS_DISABLED=1: companies are added from /admin only (src/actions/auth.ts refuses too).
  if (process.env.SIGNUPS_DISABLED === '1') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
        <div className="w-full max-w-[380px] rounded-xl2 border border-line bg-surface p-7 text-center shadow-elevated">
          <BrandMark className="mx-auto mb-3 h-11 w-11 shadow-card" />
          <h1 className="text-[19px] font-extrabold text-ink">Sign-ups are by invitation</h1>
          <p className="mt-1.5 text-[12.5px] text-ink-faint">Contact us to get a {APP_NAME} account for your business.</p>
          <Link href="/login" className="mt-5 inline-block text-[12.5px] font-bold text-brand">
            Already have an account? Log in
          </Link>
        </div>
      </div>
    );
  }
  return <SignupClient turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null} />;
}
