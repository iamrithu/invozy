import { listStockProducts } from '@/actions/inventory';
import { getLastPurchaseRates } from '@/actions/purchases';
import { listSupplierOptions } from '@/actions/suppliers';
import { getCompany } from '@/lib/get-company';
import { PurchaseForm } from '@/components/purchases/purchase-form';

export const dynamic = 'force-dynamic';

/** `?items=<productId>:<qty>,…&supplier=<id>` pre-fills the bill — the
 * Inventory screen's reorder card sends the products running low here. */
export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ items?: string; supplier?: string }> }) {
  const [{ items, supplier }, company, products, suppliers, lastRates] = await Promise.all([
    searchParams,
    getCompany(),
    listStockProducts(),
    listSupplierOptions(),
    getLastPurchaseRates(),
  ]);
  const prefill = {
    supplierId: suppliers.some((s) => s.id === supplier) ? supplier! : null,
    lines: (items ?? '')
      .split(',')
      .map((pair) => {
        const [productId, qty] = pair.split(':');
        return { productId, qty: Number(qty) };
      })
      .filter((l) => l.productId && l.qty > 0 && products.some((p) => p.id === l.productId)),
  };
  return (
    <PurchaseForm
      key={items ?? 'new'}
      purchase={null}
      prefill={prefill}
      products={products}
      suppliers={suppliers}
      lastRates={lastRates}
      company={{ state: company.state, currency: company.currency, defaultGstRate: Number(company.cgstRate) + Number(company.sgstRate) }}
      directUploads={!!process.env.BLOB_READ_WRITE_TOKEN}
    />
  );
}
