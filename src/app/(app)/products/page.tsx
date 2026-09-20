import { listProductsPage } from '@/actions/products';
import { ProductsClient } from './products-client';

export const dynamic = 'force-dynamic';

// Must match PAGE_SIZE in products-client.tsx — this is only the initial
// SSR fetch, but if it doesn't match, the client shows this page size on
// first load and silently switches to its own on the next fetch.
const PAGE_SIZE = 10;

export default async function ProductsPage() {
  const initial = await listProductsPage({ page: 1, pageSize: PAGE_SIZE, sort: 'name' });
  return <ProductsClient initialData={initial} />;
}
