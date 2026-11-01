import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pdfFileName } from '@/components/print/format';
import { notFoundJson, renderDocumentPdf, sessionOr401 } from '@/components/print/pdf-route';

export const dynamic = 'force-dynamic';
// A cold Chromium launch plus the render — same budget as the invoice PDF
// route (renders themselves are capped at 20s in src/lib/invoice-pdf.ts).
export const maxDuration = 60;

/** A payment's receipt PDF ("RCPT-26-27-0004.pdf"), rendered from
 * /print/receipts/[paymentId]. Signed-in users only; `?inline=1` shows it
 * in the browser instead of downloading. A credit note applied to an
 * invoice has no receipt — its PDF is the credit note's own. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = await sessionOr401();
  if (session.response) return session.response;

  const { paymentId } = await params;
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { receiptNo: true, creditNoteId: true, invoice: { select: { number: true } } },
  });
  if (!payment) return notFoundJson('Payment not found');
  if (payment.creditNoteId) {
    return NextResponse.json({ error: 'This amount was applied by a credit note. Download the credit note instead.' }, { status: 400 });
  }

  // Payments recorded before receipts existed have no number — name the
  // file after the invoice instead.
  const fileName = payment.receiptNo ? pdfFileName(payment.receiptNo) : pdfFileName(`Receipt-${payment.invoice.number}`);
  return renderDocumentPdf(req, {
    kind: 'print-receipt',
    printPath: '/print/receipts',
    id: paymentId,
    fileName,
    footerLeft: 'This is a computer-generated receipt.',
    footerRight: payment.receiptNo ?? undefined,
  });
}
