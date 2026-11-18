import type { Metadata } from 'next';
import { getOrderSettings } from '@/actions/orders';
import { requireUser } from '@/lib/session';
import { OwnerOnlyNotice } from '@/components/current-user';
import { APP_NAME } from '@/lib/brand';
import { OrderSettingsClient } from './order-settings-client';

export const metadata: Metadata = { title: `Orders & invoicing — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function OrderSettingsPage() {
  const me = await requireUser();
  if (me.role !== 'OWNER') return <OwnerOnlyNotice title="Orders & invoicing" message="Only the owner can change how orders are numbered and invoiced." />;
  return <OrderSettingsClient initial={await getOrderSettings()} />;
}
