import type { Metadata } from 'next';
import { auth } from '@/auth';
import { requireUser } from '@/lib/session';
import { APP_NAME } from '@/lib/brand';
import { TRIAL_DAYS } from '@/lib/plans';
import { LandingPage, type LandingViewer } from '@/components/landing/landing-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${APP_NAME} — GST billing, payments & stock for Indian businesses`,
  description: `Orders, GST invoices with e-Invoice and e-Way Bill, payments and dues, stock, delivery routes, your own web store and reports — ${TRIAL_DAYS}-day free trial.`,
};

/** The public home page — open to everyone, signed in or not. Visitors get
 * "Start free" (sign-up) and "Sign in"; a signed-in company user gets
 * "Open dashboard"; the platform super-admin gets "Open admin". */
export default async function RootPage() {
  // requireUser() throws for the super-admin (no company) and for a
  // suspended company — hence the catch; auth() tells the admin apart.
  const [session, user] = await Promise.all([auth().catch(() => null), requireUser().catch(() => null)]);
  const viewer: LandingViewer = session?.user?.role === 'SUPER_ADMIN' ? { kind: 'admin' } : user ? { kind: 'user', name: user.name ?? null } : { kind: 'guest' };
  return <LandingPage viewer={viewer} />;
}
