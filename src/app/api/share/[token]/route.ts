import { NextRequest, NextResponse } from 'next/server';
import { verifySignedToken } from '@/lib/signed-token';
import { getStoredInvoicePdf, invoicePdfFileName, PdfNotFoundError, requestPdfFromRenderer } from '@/lib/invoice-pdf';

export const dynamic = 'force-dynamic';
// Only waits on the renderer when the stored copy is stale (a cold render).
export const maxDuration = 60;

/**
 * The public invoice link sent to a customer (invoiceSharePath in
 * src/lib/invoice-pdf.ts) — no sign-in; the signed 'share-invoice' token
 * in the URL is the whole authorisation, and it only ever unlocks the one
 * invoice it was minted for. Shows the PDF in the browser.
 *
 * Streams the stored PDF when it's current. Otherwise it asks the PDF
 * route to render one (that function has Chromium; this one deliberately
 * doesn't) and passes the result through.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoiceId = verifySignedToken('share-invoice', token);
  if (!invoiceId) return notFound();

  try {
    const stored = await getStoredInvoicePdf(invoiceId);
    if (stored) return pdfResponse(stored.buffer, invoicePdfFileName(stored.number));

    const res = await requestPdfFromRenderer(invoiceId, { origin: req.nextUrl.origin, wait: true });
    if (res.status === 404) return notFound();
    if (!res.ok) throw new Error(`renderer answered HTTP ${res.status}`);
    const pdf = Buffer.from(await res.arrayBuffer());
    const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'invoice.pdf';
    return pdfResponse(pdf, filename);
  } catch (e) {
    if (e instanceof PdfNotFoundError) return notFound();
    console.error('Shared invoice PDF failed', e);
    return new NextResponse('This invoice could not be loaded right now. Please try again in a minute.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

function notFound() {
  return new NextResponse('This invoice link is invalid or has expired.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

function pdfResponse(pdf: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'private, no-store',
      // A bearer link — keep it out of search engines if it's ever posted.
      'X-Robots-Tag': 'noindex',
    },
  });
}
