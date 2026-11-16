import { rootPrisma } from './prisma';
import type { CompanyJob } from './cron-jobs';

/** Sends one job per active company to /api/cron/company (each its own
 * function invocation), a few at a time. The worker answers 202 at once and
 * works after responding, so this returns in seconds however many companies
 * there are. The only cross-company read is the list of company ids. */
export async function dispatchToCompanies(job: CompanyJob, origin: string): Promise<{ companies: number; dispatched: number; failed: string[] }> {
  const companies = await rootPrisma.company.findMany({ where: { active: true }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const failed: string[] = [];
  let dispatched = 0;
  const queue = companies.map((c) => c.id);
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const res = await fetch(`${origin}/api/cron/company`, {
          method: 'POST',
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, 'content-type': 'application/json' },
          body: JSON.stringify({ job, companyId: id }),
          cache: 'no-store',
        });
        await res.body?.cancel();
        if (res.status === 202) dispatched++;
        else failed.push(id);
      } catch {
        failed.push(id);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { companies: companies.length, dispatched, failed };
}
