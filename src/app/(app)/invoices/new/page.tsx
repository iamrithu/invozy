import { redirect } from 'next/navigation';
import { getCompany } from '@/lib/get-company';
import { listProducts } from '@/actions/products';
import { toPublicCompany } from '@/lib/public-company';
import { getAppSettings } from '@/lib/settings';
import { BuilderClient } from './builder-client';

export const dynamic = 'force-dynamic';

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  // Old "Edit" links (bookmarks, other tabs) pointed here with ?edit=<id>;
  // saved invoices are now edited at their own URL.
  if (edit) redirect(`/invoices/${edit}?edit=1`);

  const [products, company, settings] = await Promise.all([listProducts({ activeOnly: true }), getCompany(), getAppSettings()]);
  return (
    // Keyed so navigating here from an invoice's editor (e.g. the top bar's
    // "New invoice") mounts a fresh builder instead of carrying that
    // invoice's state over.
    <BuilderClient key="new" products={JSON.parse(JSON.stringify(products))} company={JSON.parse(JSON.stringify({ ...toPublicCompany(company), pdfItemRows: settings.pdfItemRows }))} editInvoice={null} />
  );
}
