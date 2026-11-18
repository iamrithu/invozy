import type { Metadata } from 'next';
import { listCustomerGroups } from '@/actions/customer-groups';
import { APP_NAME } from '@/lib/brand';
import { CustomerGroupsClient } from './customer-groups-client';

export const metadata: Metadata = { title: `Customer groups — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function CustomerGroupsPage() {
  return <CustomerGroupsClient initial={await listCustomerGroups()} />;
}
