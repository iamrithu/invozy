import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { PdfFullscreenView } from './pdf-fullscreen-view';

export const dynamic = 'force-dynamic';

// Deliberately outside the (app) route group — no Sidebar/TopBar/BottomNav,
// so the PDF gets the entire viewport instead of sharing it with app chrome.
export default async function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany();
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { companyId: true, number: true } });
  if (!invoice || invoice.companyId !== company.id) notFound();

  return <PdfFullscreenView invoiceId={id} invoiceNumber={invoice.number} />;
}
