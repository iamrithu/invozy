import type { Metadata } from 'next';
import { getPriceLists } from '@/actions/price-lists';
import { APP_NAME } from '@/lib/brand';
import { PriceListsClient } from './price-lists-client';

export const metadata: Metadata = { title: `Price lists — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function PriceListsPage() {
  return <PriceListsClient initial={await getPriceLists()} />;
}
