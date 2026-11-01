import { listSuppliers } from '@/actions/suppliers';
import { getCompany } from '@/lib/get-company';
import { SuppliersClient } from './suppliers-client';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const [company, suppliers] = await Promise.all([getCompany(), listSuppliers({ includeInactive: false })]);
  return <SuppliersClient initialData={suppliers} companyState={company.state} currency={company.currency} />;
}
