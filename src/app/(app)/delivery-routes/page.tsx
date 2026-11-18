import type { Metadata } from 'next';
import { listRoutes } from '@/actions/routes';
import { APP_NAME } from '@/lib/brand';
import { RoutesClient } from './routes-client';

export const metadata: Metadata = { title: `Delivery routes — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function DeliveryRoutesPage() {
  return <RoutesClient initial={await listRoutes()} />;
}
