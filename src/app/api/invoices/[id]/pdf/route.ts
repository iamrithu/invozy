import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getSharedBrowser } from '@/lib/pdf-browser';

export const dynamic = 'force-dynamic';

/**
 * Real, one-click PDF download (as opposed to PrintButton's window.print(),
 * which only opens the browser's print dialog) — headlessly renders this
 * exact same /invoices/[id] page (same HTML/CSS/print rules already
 * verified via manual print-to-PDF) via Playwright and streams the result
 * back as an attachment.
 *
 * See src/lib/pdf-browser.ts for which Chromium actually gets launched —
 * locally it's the full `playwright` package's own downloaded browser;
 * on Vercel (or any serverless host) it's `@sparticuz/chromium` driven via
 * `playwright-core`, since a downloaded browser binary never makes it into
 * a serverless function's deployment bundle.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.companyId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { companyId: true, number: true } });
  if (!invoice || invoice.companyId !== session.user.companyId) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const origin = req.nextUrl.origin;
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookies = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const idx = c.indexOf('=');
      return { name: c.slice(0, idx), value: c.slice(idx + 1), url: origin };
    });

  const browser = await getSharedBrowser();
  const context = await browser.newContext();
  try {
    // Forwards the requesting user's own session cookie into the headless
    // context, so this internal navigation loads authenticated as them —
    // no separate service-account/token scheme needed.
    if (cookies.length) await context.addCookies(cookies);
    const page = await context.newPage();
    // `pdfRender=1` tells the detail page to skip InlinePdfPreview (see
    // src/app/(app)/invoices/[id]/page.tsx) — that component fetches this
    // very endpoint to render inline, so without this guard rendering the
    // page here would recursively re-trigger this same route from inside
    // itself (each nested render spawning another browser context) until
    // requests time out and the shared browser is left wedged.
    await page.goto(`${origin}/invoices/${id}?pdfRender=1`, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      // A multi-page invoice (many line items, or the e-Way Bill's own
      // extra page) otherwise gives no clue a page was cut off — this
      // footer runs on every physical page once page count is known,
      // using Chromium's own pagination (pageNumber/totalPages are
      // computed post-layout, not something this route can know upfront).
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width: 100%; font-size: 8.5px; font-family: 'IBM Plex Sans', system-ui, sans-serif; color: #888; text-align: center; padding: 0 12mm;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });

    // `?inline=1` (used by InlinePdfPreview/PdfViewer) shows the PDF
    // in-browser instead of forcing a save-file prompt; the actual Download
    // button never reads this header (it fetches as a blob and forces its
    // own filename via an anchor's `download` attribute), so this only
    // affects the embedded viewers' direct navigation.
    const inline = req.nextUrl.searchParams.get('inline') === '1';
    const filename = invoice.number.replace(/[^a-zA-Z0-9-]/g, '-');

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}.pdf"`,
        'Content-Length': String(pdf.length),
      },
    });
  } finally {
    await context.close();
  }
}
