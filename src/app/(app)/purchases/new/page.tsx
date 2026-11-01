import { listStockProducts } from '@/actions/inventory';
import { getLastPurchaseRates } from '@/actions/purchases';
import { listSupplierOptions } from '@/actions/suppliers';
import { getCompany } from '@/lib/get-company';
import { PurchaseForm } from '@/components/purchases/purchase-form';

export const dynamic = 'force-dynamic';

export default async function NewPurchasePage() {
  const [company, products, suppliers, lastRates] = await Promise.all([getCompany(), listStockProducts(), listSupplierOptions(), getLastPurchaseRates()]);
  return (
    <PurchaseForm
      key="new"
      purchase={null}
      products={products}
      suppliers={suppliers}
      lastRates={lastRates}
      company={{ state: company.state, currency: company.currency, defaultGstRate: Number(company.cgstRate) + Number(company.sgstRate) }}
      directUploads={!!process.env.BLOB_READ_WRITE_TOKEN}
    />
  );
}
