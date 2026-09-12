import { listCustomersPage } from '@/actions/customers';
import { CustomersClient } from './customers-client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function CustomersPage() {
  const initial = await listCustomersPage({ page: 1, pageSize: PAGE_SIZE, sort: 'name' });
  return <CustomersClient initialData={initial} />;
}
