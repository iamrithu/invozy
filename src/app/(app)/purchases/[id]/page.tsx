import { notFound } from 'next/navigation';
import { listStockProducts } from '@/actions/inventory';
import { getLastPurchaseRates, getPurchase } from '@/actions/purchases';
import { listSupplierOptions } from '@/actions/suppliers';
import { getCompany } from '@/lib/get-company';
import { PurchaseForm } from '@/components/purchases/purchase-form';

export const dynamic = 'force-dynamic';

/** A saved bill opens straight in its editor — there's nothing on a
 * supplier bill worth a separate read-only view. */
export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const purchase = await getPurchase(id);
  if (!purchase) notFound();
  const productIds = purchase.items.map((it) => it.productId).filter((p): p is string => !!p);
  const [company, products, suppliers, lastRates] = await Promise.all([
    getCompany(),
    listStockProducts(productIds),
    listSupplierOptions(purchase.supplierId),
    getLastPurchaseRates(),
  ]);
  return (
    <PurchaseForm
      key={purchase.id}
      purchase={purchase}
      products={products}
      suppliers={suppliers}
      lastRates={lastRates}
      company={{ state: company.state, currency: company.currency, defaultGstRate: Number(company.cgstRate) + Number(company.sgstRate) }}
      directUploads={!!process.env.BLOB_READ_WRITE_TOKEN}
    />
  );
}
