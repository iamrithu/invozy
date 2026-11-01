import { buildBackup, storeBackup } from '@/lib/backup';
import { prisma } from '@/lib/prisma';
import { sweepOrphanUploads } from '@/lib/uploads';
import { cronUnauthorized, isCronAuthorized } from '../cron-auth';

export const dynamic = 'force-dynamic';
// Reading every table and gzipping it is a few seconds today; the headroom
// is for a few years of invoice lines.
export const maxDuration = 60;

/**
 * Nightly backup (vercel.json cron, 21:30 UTC = 03:00 IST, when nobody is
 * billing). Writes `backups/asb-YYYY-MM-DD.json.gz` to Vercel Blob — or
 * ./.backups locally — and deletes copies older than 30 days. See
 * src/lib/backup.ts for what's in the file. Then sweeps purchase
 * attachments uploaded over a day ago that never made it onto a bill.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorized();
  const startedAt = Date.now();
  try {
    const { gz, counts, createdAt } = await buildBackup();
    const stored = await storeBackup(gz, createdAt);
    // After the backup, and never failing it.
    let sweptUploads = 0;
    try {
      const onBills = await prisma.purchaseAttachment.findMany({ select: { url: true } });
      sweptUploads = await sweepOrphanUploads('purchases', new Set(onBills.map((a) => a.url)), 24 * 60 * 60 * 1000);
    } catch (e) {
      console.error('Sweeping unsaved purchase uploads failed', e);
    }
    const summary = { ok: true, where: stored.where, bytes: stored.bytes, pruned: stored.pruned, sweptUploads, counts, ms: Date.now() - startedAt };
    console.log('Nightly backup stored', summary);
    return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Nightly backup failed', e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Backup failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
