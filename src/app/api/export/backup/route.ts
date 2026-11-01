import { backupDate, buildBackup } from '@/lib/backup';
import { ownerGate } from '../export-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * "Download backup" on the Reports export menu — the same gzipped JSON the
 * nightly cron stores (src/lib/backup.ts), straight to the owner's device.
 * Served as a plain .gz file (Content-Type application/gzip, no
 * Content-Encoding) so the browser saves it as-is instead of unzipping it.
 */
export async function GET() {
  const denied = await ownerGate();
  if (denied) return denied;
  try {
    const { gz, createdAt } = await buildBackup();
    const name = `asb-backup-${backupDate(createdAt)}.json.gz`;
    return new Response(new Uint8Array(gz), {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(gz.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('Backup download failed', e);
    return Response.json({ error: 'Could not prepare the backup. Please try again.' }, { status: 500 });
  }
}
