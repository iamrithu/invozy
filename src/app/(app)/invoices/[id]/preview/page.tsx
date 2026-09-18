import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { PdfPreviewPanel } from './pdf-preview-panel';

export const dynamic = 'force-dynamic';

export default async function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany();
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { companyId: true, number: true } });
  if (!invoice || invoice.companyId !== company.id) notFound();

  return <PdfPreviewPanel invoiceId={id} invoiceNumber={invoice.number} />;
}
