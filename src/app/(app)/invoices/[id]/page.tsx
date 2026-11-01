import { notFound } from 'next/navigation';
import { getCompany } from '@/lib/get-company';
import { listProducts } from '@/actions/products';
import { loadInvoiceForEditor } from '@/lib/invoice-editor-data';
import { toPublicCompany } from '@/lib/public-company';
import { BuilderClient } from '../new/builder-client';

export const dynamic = 'force-dynamic';

/** A saved invoice opens straight into the editor — there is no separate
 * read-only view page any more. A PAID invoice opens in preview mode first
 * (so a settled bill isn't changed by accident) with Edit one click away;
 * `?edit=1` skips straight to editing. */
export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const [{ id }, { edit }] = await Promise.all([params, searchParams]);
  // getCompany() also enforces sign-in, so the invoice read is discarded
  // (Promise.all rejects) for an unauthenticated request.
  const [products, company, invoice] = await Promise.all([listProducts({ activeOnly: true }), getCompany(), loadInvoiceForEditor(id)]);
  if (!invoice) notFound();

  return (
    <BuilderClient
      key={invoice.id}
      products={JSON.parse(JSON.stringify(products))}
      company={JSON.parse(JSON.stringify(toPublicCompany(company)))}
      editInvoice={invoice}
      initialMode={invoice.status === 'PAID' && edit !== '1' ? 'preview' : 'edit'}
    />
  );
}
