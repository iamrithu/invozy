import { createSignedToken } from './signed-token';
import { renderPrintPage } from './invoice-pdf';
import { isReportMonth, monthLabel } from '@/app/print/monthly-report/month';

/** Long enough for a cold Chromium launch plus the page load, same as the
 * other document PDFs (src/components/print/pdf-route.ts). */
const PRINT_TOKEN_TTL_S = 120;

/**
 * The monthly report for `month` (`YYYY-MM`) as an A4 PDF: mints a
 * two-minute 'print-monthly-report' token for that month and renders
 * /print/monthly-report in the shared headless browser.
 *
 * Callers do their own access check — the Export menu's route is owner-only
 * (src/app/api/pdf/monthly-report/route.ts) and the 1st-of-the-month email
 * runs from the cron. Outside a request, `origin` falls back to AUTH_URL /
 * Vercel's URL (see renderPrintPage). Needs Chromium traced into the
 * calling route's function (next.config.js outputFileTracingIncludes).
 */
export async function buildMonthlyReportPdf(month: string, opts: { origin?: string } = {}): Promise<Buffer> {
  if (!isReportMonth(month)) throw new Error(`Monthly report: "${month}" is not a YYYY-MM month.`);
  const token = createSignedToken('print-monthly-report', month, PRINT_TOKEN_TTL_S);
  return renderPrintPage(`/print/monthly-report?m=${month}&t=${encodeURIComponent(token)}`, {
    origin: opts.origin,
    footerLeft: `Monthly report - ${monthLabel(month)}`,
  });
}
