import type { Metadata } from 'next';
import { loadStore } from '@/lib/store-public';
import { earliestDeliveryDate } from '@/lib/store-settings';
import { CheckoutClient } from './checkout-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const store = await loadStore((await params).slug);
  if (!store) return null;
  return (
    <CheckoutClient
      slug={store.slug}
      storeName={store.name}
      products={store.products}
      defaultState={store.state}
      slots={store.settings.slots}
      earliest={earliestDeliveryDate(store.settings)}
      payCod={store.settings.payCod}
      payUpi={store.settings.payUpi}
      zones={store.zoneCount}
    />
  );
}
