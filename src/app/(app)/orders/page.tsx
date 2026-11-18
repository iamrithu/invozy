import type { Metadata } from 'next';
import { listOrders, type OrderTab } from '@/actions/orders';
import { APP_NAME } from '@/lib/brand';
import { OrdersClient } from './orders-client';

export const metadata: Metadata = { title: `Orders — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

const TABS: OrderTab[] = ['all', 'new', 'dispatch', 'out', 'delivered', 'cancelled', 'drafts'];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab = TABS.includes(tab as OrderTab) ? (tab as OrderTab) : 'all';
  const initial = await listOrders({ tab: initialTab, page: 1, pageSize: 25 });
  return <OrdersClient initialData={initial} initialTab={initialTab} />;
}
