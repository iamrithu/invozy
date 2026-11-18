import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getOrder } from '@/actions/orders';
import { getCompany } from '@/lib/get-company';
import { APP_NAME } from '@/lib/brand';
import { triggerNote } from '@/lib/order-trigger';
import { OrderDetailClient } from './order-detail-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrder(id).catch(() => null);
  return { title: `${order?.number ?? 'Order'} — ${APP_NAME}` };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, company] = await Promise.all([getOrder(id), getCompany()]);
  if (!order) notFound();
  return <OrderDetailClient initial={order} trigger={company.invoiceTrigger} triggerNote={triggerNote(company.invoiceTrigger)} />;
}
