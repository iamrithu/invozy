import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { verifySignedToken } from '@/lib/signed-token';
import { loadPrintLetterhead, loadReceiptDocument } from '@/components/print/print-data';
import { PrintPageShell } from '@/components/print/print-page-shell';
import { ReceiptDocument } from '@/components/print/receipt-document';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment receipt', robots: { index: false, follow: false } };

/**
 * What the PDF renderer prints for /api/pdf/receipts/[paymentId]: one
 * payment receipt, no app shell. Signed 'print-receipt' token in `?t=`
 * instead of a session (see src/app/print/credit-notes/[id]/page.tsx).
 * A credit note applied to an invoice isn't a receipt — it prints as the
 * credit note — so those payments are a 404 here too.
 */
export default async function PrintReceiptPage({ params, searchParams }: { params: Promise<{ paymentId: string }>; searchParams: Promise<{ t?: string | string[] }> }) {
  const [{ paymentId }, { t }] = await Promise.all([params, searchParams]);
  if (verifySignedToken('print-receipt', typeof t === 'string' ? t : null) !== paymentId) notFound();

  const [receipt, company] = await Promise.all([loadReceiptDocument(paymentId), loadPrintLetterhead()]);
  if (!receipt || receipt.creditNoteId || !company) notFound();

  return (
    <PrintPageShell>
      <ReceiptDocument receipt={receipt} company={company} />
    </PrintPageShell>
  );
}
