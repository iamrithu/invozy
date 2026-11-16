import { dispatchToCompanies } from '@/lib/cron-dispatch';
import { configuredSiteOrigin } from '@/lib/site-origin';
import { cronUnauthorized, isCronAuthorized } from '../cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Nightly backups (vercel.json cron, 21:30 UTC = 03:00 IST): hands each
 * active company its own backup job at /api/cron/company —
 * backups/<companyId>/invozy-YYYY-MM-DD.json.gz, 30 days kept, plus sweeping
 * its abandoned bill uploads (src/lib/cron-jobs.ts).
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorized();
  const summary = await dispatchToCompanies('backup', configuredSiteOrigin() ?? new URL(req.url).origin);
  if (summary.failed.length) console.error('Backup dispatch failed for', summary.failed);
  return Response.json(summary, { status: summary.failed.length ? 500 : 200, headers: { 'Cache-Control': 'no-store' } });
}
