import { after, NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { withSignedTenant } from '@/lib/signed-request';
import { runWithTenant } from '@/lib/tenant';
import { ensureInvoicePdf, getInvoicePdf, invoicePdfFileName, PdfNotFoundError } from '@/lib/invoice-pdf';
import { configuredSiteOrigin } from '@/lib/site-origin';

export const dynamic = 'force-dynamic';
// A cold @sparticuz/chromium launch (extracting its bundled binary) plus a
// render can outlast a serverless function's default duration; renders
// themselves are capped at 20s in src/lib/invoice-pdf.ts. See vercel.json
// for the matching memory bump — Chromium needs more than the default.
export const maxDuration = 60;

/**
 * The invoice PDF — the one place PDFs are rendered (this function is the
 * one with Chromium bundled; see the top of src/lib/invoice-pdf.ts).
 *
 * GET (signed-in users): the stored PDF when it's current, otherwise a
 * fresh render. Served as a download named after the invoice number
 * ("INV-26-27-1020.pdf"), or shown in the browser with `?inline=1` (the
 * in-app viewer).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;
  try {
    const { buffer, number } = await getInvoicePdf(id, { origin: (configuredSiteOrigin() ?? req.nextUrl.origin) });
    return pdfResponse(buffer, number, req.nextUrl.searchParams.get('inline') === '1' ? 'inline' : 'attachment');
  } catch (e) {
    return errorResponse(id, e);
  }
}

/**
 * Machine-to-machine: `Authorization: Bearer <'pdf-build' token for this
 * invoice>` (src/lib/invoice-pdf.ts's requestPdfFromRenderer). Used by
 * schedulePdfBuild after an invoice is saved — answers 202 at once and
 * builds after responding — and by the public share link when the stored
 * copy is stale (`?wait=1`: answers with the PDF itself).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const origin = (configuredSiteOrigin() ?? req.nextUrl.origin);
  const wait = req.nextUrl.searchParams.get('wait') === '1';

  // Acts for the company the token was minted for, and only for this invoice.
  const res = await withSignedTenant('pdf-build', token, id, async ({ companyId }) => {
    if (!wait) {
      // after() may run outside this context, so it re-enters the company.
      after(() =>
        runWithTenant(companyId, async () => {
          try {
            await ensureInvoicePdf(id, { origin });
          } catch (e) {
            if (!(e instanceof PdfNotFoundError)) console.error(`PDF prebuild failed for invoice ${id}`, e);
          }
        })
      );
      return new NextResponse(null, { status: 202 });
    }
    try {
      const { buffer, number } = await getInvoicePdf(id, { origin });
      return pdfResponse(buffer, number, 'inline');
    } catch (e) {
      return errorResponse(id, e);
    }
  });
  return res ?? NextResponse.json({ error: 'Not allowed' }, { status: 403 });
}

function pdfResponse(pdf: Buffer, invoiceNumber: string, disposition: 'inline' | 'attachment') {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${invoicePdfFileName(invoiceNumber)}"`,
      'Content-Length': String(pdf.length),
      // Per-user and changes on every edit — never let a browser or CDN
      // hand back yesterday's copy.
      'Cache-Control': 'private, no-store',
    },
  });
}

function errorResponse(id: string, e: unknown) {
  if (e instanceof PdfNotFoundError) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  console.error(`PDF generation failed for invoice ${id}`, e);
  return NextResponse.json({ error: 'Could not prepare the PDF. Please try again.' }, { status: 500 });
}
