import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';
import { createSignedToken } from '@/lib/signed-token';
import { todayIst } from '@/lib/dates';
import { renderPrintPage } from '@/lib/invoice-pdf';
import { loadingSheetQuery, loadingSheetTokenId, normalizeLoadingParams } from '@/app/(app)/reports/loading-sheet/loading-sheet-data';
import { requireModule } from '@/lib/require-module';
import { configuredSiteOrigin } from '@/lib/site-origin';

export const dynamic = 'force-dynamic';
// Same budget as the invoice PDF route: a cold Chromium launch plus the
// render (capped at 20s inside renderPrintPage). Needs the same memory and
// Chromium file tracing as /api/invoices/[id]/pdf — see vercel.json and
// next.config.js outputFileTracingIncludes.
export const maxDuration = 60;

/**
 * "Download PDF" on the loading sheet — `?date=YYYY-MM-DD&group=vehicle|
 * route&drafts=1`. Any signed-in login (staff print these for the
 * drivers). Renders /print/loading-sheet in the shared headless browser
 * with a 2-minute token bound to these exact params, and answers with the
 * PDF as a download. Not stored: it changes every time an invoice for the
 * day does, and rendering it is a one-off at dispatch time.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const moduleOff = await requireModule('reports').then(() => null, (e: Error) => e.message);
  if (moduleOff) return Response.json({ error: moduleOff }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const params = normalizeLoadingParams({ date: sp.get('date'), group: sp.get('group'), drafts: sp.get('drafts') }, todayIst());
  const token = await createSignedToken('print-loading-sheet', loadingSheetTokenId(params), 120);

  try {
    const pdf = await renderPrintPage(`/print/loading-sheet?${loadingSheetQuery(params)}&t=${encodeURIComponent(token)}`, {
      origin: (configuredSiteOrigin() ?? req.nextUrl.origin),
      footerLeft: `Loading sheet - ${params.date}`,
      footerRight: params.group === 'vehicle' ? 'By vehicle' : 'By route',
    });
    const fileName = `asb-loading-sheet-${params.date}${params.group === 'route' ? '-by-route' : ''}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('Loading sheet PDF failed', e);
    return Response.json({ error: 'Could not prepare the PDF. Please try again.' }, { status: 500 });
  }
}
