import { getPurchaseSummary, listPurchasesPage } from '@/actions/purchases';
import { listSupplierOptions } from '@/actions/suppliers';
import { getCompany } from '@/lib/get-company';
import { PurchasesClient } from './purchases-client';

export const dynamic = 'force-dynamic';

// Must match PAGE_SIZE in purchases-client.tsx.
const PAGE_SIZE = 20;

export default async function PurchasesPage() {
  const [company, initial, summary, suppliers] = await Promise.all([
    getCompany(),
    listPurchasesPage({ page: 1, pageSize: PAGE_SIZE }),
    getPurchaseSummary(),
    listSupplierOptions(),
  ]);
  return <PurchasesClient initialData={initial} initialSummary={summary} suppliers={suppliers} currency={company.currency} />;
}
