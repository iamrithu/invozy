import type { Metadata } from 'next';
import { getCompany } from '@/lib/get-company';
import { APP_NAME } from '@/lib/brand';
import { triggerNote } from '@/lib/order-trigger';
import { OrderForm } from '@/components/orders/order-form';

export const metadata: Metadata = { title: `New order — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ quick?: string }> }) {
  const [{ quick }, company] = await Promise.all([searchParams, getCompany()]);
  return <OrderForm quick={quick === '1'} companyState={company.state} triggerNote={triggerNote(company.invoiceTrigger)} />;
}
