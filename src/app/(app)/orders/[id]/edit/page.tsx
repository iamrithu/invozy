import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getOrder } from '@/actions/orders';
import { getCompany } from '@/lib/get-company';
import { APP_NAME } from '@/lib/brand';
import { triggerNote } from '@/lib/order-trigger';
import { OrderForm } from '@/components/orders/order-form';

export const metadata: Metadata = { title: `Edit order — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

const EDITABLE = ['DRAFT', 'PENDING', 'CONFIRMED', 'PACKED'];

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, company] = await Promise.all([getOrder(id), getCompany()]);
  if (!order) notFound();
  // Invoiced, delivered or cancelled orders are read-only.
  if (order.invoice || !EDITABLE.includes(order.status)) redirect(`/orders/${id}`);
  return <OrderForm order={order} companyState={company.state} triggerNote={triggerNote(company.invoiceTrigger)} />;
}
