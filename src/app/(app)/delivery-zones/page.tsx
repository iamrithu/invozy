import type { Metadata } from 'next';
import { listZones } from '@/actions/storefront';
import { APP_NAME } from '@/lib/brand';
import { ZonesClient } from './zones-client';

export const metadata: Metadata = { title: `Delivery zones — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function DeliveryZonesPage() {
  return <ZonesClient initial={await listZones()} />;
}
