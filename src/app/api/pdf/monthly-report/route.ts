import { NextResponse, type NextRequest } from 'next/server';
import { requireOwner } from '@/lib/session';
import { buildMonthlyReportPdf } from '@/lib/monthly-report-pdf';
import { isReportMonth, monthlyReportFileName } from '@/app/print/monthly-report/month';
import { requireModule } from '@/lib/require-module';
import { configuredSiteOrigin } from '@/lib/site-origin';

export const dynamic = 'force-dynamic';
// A cold Chromium launch plus the render (capped at 20s inside
// renderPrintPage) — same budget, memory and Chromium file tracing as the
// other /api/pdf/** routes (vercel.json, next.config.js).
export const maxDuration = 60;

/**
 * "Monthly report PDF" from the Reports export menu — `?month=YYYY-MM`.
 * Owner only: it carries profit, every customer's balance and the GST
 * position. Answers with `report-2026-10.pdf` as a download.
 */
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    await requireModule('reports');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Not signed in.';
    return NextResponse.json({ error: message }, { status: /owner|enabled/i.test(message) ? 403 : 401 });
  }

  const month = req.nextUrl.searchParams.get('month');
  if (!isReportMonth(month)) return NextResponse.json({ error: 'Pick a month for the report.' }, { status: 400 });

  try {
    const pdf = await buildMonthlyReportPdf(month, { origin: (configuredSiteOrigin() ?? req.nextUrl.origin) });
    const fileName = monthlyReportFileName(month);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error(`Monthly report PDF failed for ${month}`, e);
    return NextResponse.json({ error: 'Could not prepare the report PDF. Please try again.' }, { status: 500 });
  }
}
