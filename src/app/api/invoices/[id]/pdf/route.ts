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
    await page.goto(`${origin}/invoices/${id}`, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });

    // `?inline=1` (used by the detail page's embedded preview iframe) shows
    // the PDF in-browser instead of forcing a save-file prompt; the actual
    // Download button never reads this header (it fetches as a blob and
    // forces its own filename via an anchor's `download` attribute), so
    // this only affects direct navigation / the iframe.
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
