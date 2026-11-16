import { dispatchToCompanies } from '@/lib/cron-dispatch';
import { configuredSiteOrigin } from '@/lib/site-origin';
import { cronUnauthorized, isCronAuthorized } from '../cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The 8 AM run (vercel.json cron, 02:30 UTC = 08:00 IST): hands each active
 * company its own job at /api/cron/company — the summary email to its owners
 * (last month's report PDF on the 1st, when Reports is on) and any
 * subscription reminder due (src/lib/cron-jobs.ts).
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorized();
  const summary = await dispatchToCompanies('daily', configuredSiteOrigin() ?? new URL(req.url).origin);
  if (summary.failed.length) console.error('Daily job dispatch failed for', summary.failed);
  return Response.json(summary, { status: summary.failed.length ? 500 : 200, headers: { 'Cache-Control': 'no-store' } });
}
