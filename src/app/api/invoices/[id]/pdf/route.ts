import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getSharedBrowser } from '@/lib/pdf-browser';

export const dynamic = 'force-dynamic';
// Launching @sparticuz/chromium cold (extracting its bundled binary) plus a
// full page render/networkidle wait routinely takes longer than a
// serverless function's default duration — Vercel's default is 15s on Pro
// (10s on Hobby, which cannot be raised past this at all), well under what
// a cold start needs. See vercel.json for the matching memory bump; chromium
// is memory-hungry enough that the default 1024MB can also cause failures.
export const maxDuration = 60;

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
    // Set *before* navigating, not after: the invoice sheet's self-
    // measuring pagination (see print-pagination.tsx) measures real
    // section heights on mount, and those sections only exist in the
    // layout at all once print media is active (the print-only copy is
    // collapsed to zero height outside of it — see the `.invoice-print`
    // wrapper in invoices/[id]/page.tsx). Emulating print media only
    // after the page has already loaded and measured would have it
    // measure everything as zero and silently fall back to "no
    // pagination".
    await page.emulateMedia({ media: 'print' });
    // `pdfRender=1` tells the detail page to skip InlinePdfPreview (see
    // src/app/(app)/invoices/[id]/page.tsx) — that component fetches this
    // very endpoint to render inline, so without this guard rendering the
    // page here would recursively re-trigger this same route from inside
    // itself (each nested render spawning another browser context) until
    // requests time out and the shared browser is left wedged.
    await page.goto(`${origin}/invoices/${id}?pdfRender=1`, { waitUntil: 'networkidle', timeout: 45_000 });
    // The invoice sheet renders once, measures its own real section
    // heights, then re-renders with the corrected page split — this waits
    // for that corrected layout to commit (see the `data-pdf-ready`
    // marker in invoice-sheet.tsx / invoice-sheet-classic.tsx) rather than
    // capturing whatever happened to be on screen right after navigation.
    // `state: 'attached'` — the marker is deliberately `display:none` (see
    // its render site), so the default `state: 'visible'` would never
    // resolve; presence in the DOM is all that signals the corrected
    // layout has committed.
    await page.waitForSelector('[data-pdf-ready="true"]', { state: 'attached', timeout: 15_000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      // A multi-page invoice (many line items, or the closing block
      // overflowing onto its own page — see ClassicClosing's natural print
      // flow) otherwise gives no clue a page was cut off — this footer runs
      // on every physical page once page count is known, using Chromium's
      // own pagination (`pageNumber`/`totalPages` are computed post-layout
      // by Chromium itself, so this is accurate even when the split comes
      // from natural content overflow rather than this app's own explicit
      // per-item pagination).
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width: 100%; display: flex; justify-content: space-between; font-size: 8.5px; font-family: 'IBM Plex Sans', system-ui, sans-serif; color: #000; padding: 0 12mm;">
          <span>This is a computer generated invoice.</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
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
  } catch (e) {
    console.error(`PDF generation failed for invoice ${id}`, e);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  } finally {
    await context.close();
  }
}
