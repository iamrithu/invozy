import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { OwnerOnlyNotice } from '@/components/current-user';
import { getBillingOverview } from '@/actions/subscription';
import { APP_NAME } from '@/lib/brand';
import { BillingClient } from './billing-client';

export const metadata: Metadata = { title: `Billing & plan — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const me = await requireUser().catch(() => null);
  if (!me) redirect('/login');
  if (me.role !== 'OWNER') return <OwnerOnlyNotice title="Billing & plan" message="Only the owner can see and change the plan." />;
  return <BillingClient initial={await getBillingOverview()} viewOnly={me.viewOnly} />;
}
