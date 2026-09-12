import { listProducts } from '@/actions/products';
import { getCompanyProfile } from '@/actions/company';
import { BuilderClient } from './builder-client';

export const dynamic = 'force-dynamic';

export default async function NewInvoicePage() {
  const [products, company] = await Promise.all([listProducts({ activeOnly: true }), getCompanyProfile()]);
  return (
    <BuilderClient
      products={JSON.parse(JSON.stringify(products))}
      company={JSON.parse(JSON.stringify(company))}
    />
  );
}
