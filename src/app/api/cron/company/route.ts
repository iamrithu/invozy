import { after } from 'next/server';
import { rootPrisma } from '@/lib/prisma';
import { runWithTenant } from '@/lib/tenant';
import { runBackupJob, runDailyJob, type CompanyJob } from '@/lib/cron-jobs';
import { reportError } from '@/lib/error-report';
import { configuredSiteOrigin } from '@/lib/site-origin';
import { todayIst } from '@/lib/dates';
import { cronUnauthorized, isCronAuthorized } from '../cron-auth';

export const dynamic = 'force-dynamic';
// One company's job: the daily email (with a PDF on the 1st) or its backup.
export const maxDuration = 60;

const JOBS: CompanyJob[] = ['daily', 'backup'];

/**
 * The worker the cron dispatchers (/api/cron/daily, /api/cron/backup) call
 * once per company. CRON_SECRET only. Answers 202 straight away and does the
 * work after responding, strictly inside that company's scope.
 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorized();
  const body = (await req.json().catch(() => null)) as { job?: string; companyId?: string } | null;
  const job = body?.job as CompanyJob;
  const companyId = body?.companyId;
  if (!JOBS.includes(job) || typeof companyId !== 'string') return Response.json({ error: 'Bad request' }, { status: 400 });
  const company = await rootPrisma.company.findUnique({ where: { id: companyId }, select: { active: true } });
  if (!company?.active) return Response.json({ skipped: 'not active' }, { status: 200 });

  const origin = configuredSiteOrigin() ?? new URL(req.url).origin;
  after(() =>
    runWithTenant(companyId, async () => {
      const started = Date.now();
      try {
        const result = job === 'daily' ? await runDailyJob(origin, todayIst()) : await runBackupJob();
        console.log(JSON.stringify({ level: 'info', cron: job, companyId, ms: Date.now() - started, ...result }));
      } catch (e) {
        await reportError(e, { cron: job, companyId });
      }
    })
  );
  return Response.json({ accepted: true }, { status: 202 });
}
