import { getSharedPdfContext } from '@/lib/pdf-browser';
import { cronUnauthorized, isCronAuthorized } from '../cron-auth';

export const dynamic = 'force-dynamic';
// A cold start here is the very thing being paid for ahead of time —
// extracting @sparticuz/chromium and launching it can take most of 10s.
export const maxDuration = 60;

/**
 * Keeps a PDF-capable function instance warm (vercel.json cron, every 10
 * minutes — sub-daily crons need a Vercel Pro plan). Launches (or reuses)
 * the shared headless Chromium and its context, opens a blank page and
 * closes it again, so the next "Download PDF" skips the browser launch.
 *
 * Only warms the instance it runs in: for this to help the PDF routes, this
 * route needs the same Chromium tracing (next.config.js
 * outputFileTracingIncludes) and memory (vercel.json) as they have.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorized();
  const startedAt = Date.now();
  try {
    const context = await getSharedPdfContext();
    const launchedMs = Date.now() - startedAt;
    const page = await context.newPage();
    try {
      await page.goto('about:blank');
    } finally {
      await page.close().catch(() => {});
    }
    return Response.json({ ok: true, launchedMs, ms: Date.now() - startedAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('PDF warm-up failed', e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Warm-up failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
