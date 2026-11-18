import type { Metadata } from 'next';
import { getStoreAdmin } from '@/actions/storefront';
import { APP_NAME } from '@/lib/brand';
import { StorefrontClient } from './storefront-client';

export const metadata: Metadata = { title: `Storefront — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function StorefrontPage() {
  return <StorefrontClient initial={await getStoreAdmin()} />;
}
