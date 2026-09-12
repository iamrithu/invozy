import { listProductsPage } from '@/actions/products';
import { ProductsClient } from './products-client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function ProductsPage() {
  const initial = await listProductsPage({ page: 1, pageSize: PAGE_SIZE, sort: 'name' });
  return <ProductsClient initialData={initial} />;
}
