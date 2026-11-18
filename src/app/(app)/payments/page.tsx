import type { Metadata } from 'next';
import { listPayments } from '@/actions/payments';
import { todayIst } from '@/lib/dates';
import { APP_NAME } from '@/lib/brand';
import { PaymentsClient } from './payments-client';

export const metadata: Metadata = { title: `Payments — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const to = todayIst();
  const from = `${to.slice(0, 8)}01`;
  return <PaymentsClient initial={await listPayments({ from, to })} defaultFrom={from} defaultTo={to} />;
}
