import { buildBackup, storeBackup } from '@/lib/backup';
import { prisma, rootPrisma } from '@/lib/prisma';
import { runWithTenant } from '@/lib/tenant';
import { sweepOrphanUploads } from '@/lib/uploads';
import { cronUnauthorized, isCronAuthorized } from '../cron-auth';

export const dynamic = 'force-dynamic';
// Reading every table and gzipping it is a few seconds per company today.
// With many companies this route will need splitting into per-company
// invocations before it reaches the limit — the log line says how long it took.
export const maxDuration = 60;

/**
 * Nightly backups (vercel.json cron, 21:30 UTC = 03:00 IST, when nobody is
 * billing) — one per active company, each built and stored strictly inside
 * that company's scope: `backups/<companyId>/invozy-YYYY-MM-DD.json.gz` in
 * Vercel Blob, or ./.backups/<companyId>/ locally, with copies older than
 * 30 days deleted. See src/lib/backup.ts for what's in the file. Then sweeps
 * that company's purchase attachments uploaded over a day ago that never
 * made it onto a bill. One company failing never stops the others.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorized();
  const startedAt = Date.now();
  // The only cross-company read: which companies to run for.
  const companies = await rootPrisma.company.findMany({ where: { active: true }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const results: Record<string, unknown>[] = [];
  for (const { id } of companies) {
    const one = await runWithTenant(id, async () => {
      try {
        const { gz, counts, createdAt } = await buildBackup();
        const stored = await storeBackup(gz, createdAt);
        // After the backup, and never failing it.
        let sweptUploads = 0;
        try {
          const onBills = await prisma.purchaseAttachment.findMany({ select: { url: true } });
          sweptUploads = await sweepOrphanUploads(id, 'purchases', new Set(onBills.map((a) => a.url)), 24 * 60 * 60 * 1000);
        } catch (e) {
          console.error(`Sweeping unsaved purchase uploads failed for company ${id}`, e);
        }
        return { companyId: id, ok: true, where: stored.where, bytes: stored.bytes, pruned: stored.pruned, sweptUploads, invoices: counts.Invoice ?? 0 };
      } catch (e) {
        console.error(`Nightly backup failed for company ${id}`, e);
        return { companyId: id, ok: false, error: e instanceof Error ? e.message : 'Backup failed' };
      }
    });
    results.push(one);
  }
  const failed = results.filter((r) => !r.ok).length;
  const summary = { ok: failed === 0, companies: companies.length, failed, ms: Date.now() - startedAt, results };
  console.log('Nightly backups', summary);
  return Response.json(summary, { status: failed ? 500 : 200, headers: { 'Cache-Control': 'no-store' } });
}
