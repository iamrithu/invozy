import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { listProducts } from '@/actions/products';
import { getCompanyProfile } from '@/actions/company';
import { BuilderClient } from './builder-client';

export const dynamic = 'force-dynamic';

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [products, company] = await Promise.all([listProducts({ activeOnly: true }), getCompanyProfile()]);

  let editInvoice = null;
  if (edit) {
    const companyRow = await getCompany();
    const invoice = await prisma.invoice.findUnique({
      where: { id: edit },
      include: { customer: true, items: { include: { product: { select: { packQty: true } } } } },
    });
    if (!invoice || invoice.companyId !== companyRow.id) notFound();
    // Editing in place is allowed any time up to (not including) PAID —
    // once fully paid it's treated as settled/closed (recordPayment /
    // duplicateInvoice are the supported paths after that point). A stale
    // Edit link (opened before the status changed elsewhere) lands on the
    // real invoice instead of a dead end.
    if (invoice.status === 'PAID') redirect(`/invoices/${edit}`);

    editInvoice = {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      customer: invoice.customer,
      date: invoice.date.toISOString().slice(0, 10),
      due: invoice.due.toISOString().slice(0, 10),
      overallDiscountType: invoice.overallDiscountType,
      overallDiscountValue: Number(invoice.overallDiscountValue),
      notes: invoice.notes ?? '',
      deliveryInstructions: invoice.deliveryInstructions ?? '',
      lines: invoice.items.map((it) => ({
        lineId: it.id,
        productId: it.productId,
        name: it.name,
        unit: it.unit,
        qty: Number(it.qty),
        rate: Number(it.rate),
        discount: Number(it.discount),
        packQty: it.product?.packQty ?? null,
        hsn: it.hsn,
        batch: it.batch,
        altUnit: it.altUnit,
        altQtyPerUnit: it.altQtyPerUnit ? Number(it.altQtyPerUnit) : null,
      })),
    };
  }

  return (
    // Keyed on the edit target (or "new") — without this, navigating between
    // /invoices/new and /invoices/new?edit=<id> (e.g. clicking "New invoice"
    // from the top bar while editing a draft) reuses the same BuilderClient
    // instance, so its internal state (customer, lines, dates, notes…) from
    // the previous session would otherwise carry over instead of resetting.
    <BuilderClient
      key={editInvoice?.id ?? 'new'}
      products={JSON.parse(JSON.stringify(products))}
      company={JSON.parse(JSON.stringify(company))}
      editInvoice={editInvoice ? JSON.parse(JSON.stringify(editInvoice)) : null}
    />
  );
}
