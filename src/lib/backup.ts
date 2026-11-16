import { promisify } from 'node:util';
import { gzip as gzipCb } from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { put, list, del } from '@vercel/blob';
import { prisma } from './prisma';
import { currentCompanyId } from './tenant';

// Per-company data backups — every business table as JSON, gzipped, for the
// company in scope only (every read goes through the tenant-scoped client).
// Two ways in: the owner's "Download backup" (src/app/api/export/backup) and
// the nightly cron (src/app/api/cron/backup), which runs this once per
// company and keeps 30 days of copies per company in Vercel Blob under
// backups/<companyId>/, or under ./.backups/<companyId>/ when there's no
// Blob store (local dev; that folder is git-ignored).
//
// What's left out, on purpose: the company's two encrypted NIC secrets and
// every login's password hash (a backup file gets emailed, copied to pen
// drives…; those should never travel with it), plus the login-throttle and
// password-reset tables, which are short-lived security state, not data.
//
// The format is deliberately boring — `{ tables: { Invoice: [...rows] } }`
// with Prisma's own JSON for each row (Decimals as strings, dates as ISO
// strings) — so restoring is a script away and the file can be read by eye.

const gzip = promisify(gzipCb);

export const BACKUP_FORMAT = 'invozy-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_RETENTION_DAYS = 30;

/** Rows per query — big enough to be quick, small enough that one page of
 * invoice lines is a modest message over Neon's WebSocket. */
const PAGE = 2000;

/** Pages through a table by primary key (every table here has a string
 * `id`), so a large table is read in bounded chunks rather than one query. */
async function readAll<T extends { id: string }>(page: (cursor: string | undefined) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows = await page(cursor);
    out.push(...rows);
    if (rows.length < PAGE) return out;
    cursor = rows[rows.length - 1].id;
  }
}

/** Prisma cursor args for one page after `cursor`. */
function after(cursor: string | undefined) {
  return {
    take: PAGE,
    orderBy: { id: 'asc' as const },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

/** Reads every table and returns the backup as gzipped JSON, plus the row
 * counts (handy for the cron's log line). Tables are read one after
 * another rather than all at once to stay gentle on the database. */
export async function buildBackup(): Promise<{ gz: Buffer; counts: Record<string, number>; createdAt: Date }> {
  const createdAt = new Date();
  const tables: Record<string, unknown[]> = {};

  const companies = await prisma.company.findMany();
  tables.Company = companies.map(({ nicPasswordEnc: _p, nicClientSecretEnc: _s, ...rest }) => rest);

  tables.User = await readAll((c) =>
    prisma.user.findMany({
      ...after(c),
      select: { id: true, email: true, phone: true, name: true, role: true, active: true, createdAt: true, onboardedAt: true },
    })
  );

  tables.Product = await readAll((c) => prisma.product.findMany(after(c)));
  tables.ProductPriceTier = await readAll((c) => prisma.productPriceTier.findMany(after(c)));
  tables.Customer = await readAll((c) => prisma.customer.findMany(after(c)));
  tables.CustomerPrice = await readAll((c) => prisma.customerPrice.findMany(after(c)));
  tables.Scheme = await readAll((c) => prisma.scheme.findMany(after(c)));
  tables.Supplier = await readAll((c) => prisma.supplier.findMany(after(c)));
  tables.Invoice = await readAll((c) => prisma.invoice.findMany(after(c)));
  tables.InvoiceItem = await readAll((c) => prisma.invoiceItem.findMany(after(c)));
  tables.Payment = await readAll((c) => prisma.payment.findMany(after(c)));
  tables.Purchase = await readAll((c) => prisma.purchase.findMany(after(c)));
  tables.PurchaseItem = await readAll((c) => prisma.purchaseItem.findMany(after(c)));
  tables.PurchaseAttachment = await readAll((c) => prisma.purchaseAttachment.findMany(after(c)));
  tables.CreditNote = await readAll((c) => prisma.creditNote.findMany(after(c)));
  tables.CreditNoteItem = await readAll((c) => prisma.creditNoteItem.findMany(after(c)));
  tables.Refund = await readAll((c) => prisma.refund.findMany(after(c)));
  tables.StockMovement = await readAll((c) => prisma.stockMovement.findMany(after(c)));
  tables.ActivityLog = await readAll((c) => prisma.activityLog.findMany(after(c)));

  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: createdAt.toISOString(), counts, tables };
  const gz = await gzip(Buffer.from(JSON.stringify(file)), { level: 9 });
  return { gz, counts, createdAt };
}

/** `invozy-backup-2026-10-31.json.gz` for downloads; the stored nightly
 * copy is `backups/<companyId>/invozy-2026-10-31.json.gz` (see storeBackup).
 * Dated in IST. */
export function backupDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

const LOCAL_DIR = path.join(process.cwd(), '.backups');

export type StoredBackup = { where: 'blob' | 'local'; location: string; bytes: number; pruned: number };

/** Saves one backup and prunes anything older than the retention window.
 *
 * Vercel Blob when a store is connected (BLOB_READ_WRITE_TOKEN — the same
 * switch as uploads and stored PDFs). Private access is tried first, since
 * this is the whole business's data; a store created as public refuses
 * private blobs, so that case falls back to a public blob with a random,
 * unguessable suffix (the URL is never shown anywhere). Without Blob, the
 * file goes to ./.backups — which only works where the disk is writable,
 * i.e. not on a serverless host. */
export async function storeBackup(gz: Buffer, createdAt: Date): Promise<StoredBackup> {
  const companyId = await currentCompanyId();
  const name = `invozy-${backupDate(createdAt)}.json.gz`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const pathname = `backups/${companyId}/${name}`;
    let url: string;
    try {
      ({ url } = await put(pathname, gz, { access: 'private', contentType: 'application/gzip', allowOverwrite: true, addRandomSuffix: false }));
    } catch (e) {
      console.warn('Private Blob upload refused — falling back to an unlisted public blob.', e instanceof Error ? e.message : e);
      ({ url } = await put(pathname, gz, { access: 'public', contentType: 'application/gzip', addRandomSuffix: true }));
    }
    const pruned = await pruneBlobBackups(companyId, createdAt);
    return { where: 'blob', location: url, bytes: gz.length, pruned };
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error('Nightly backups need a Vercel Blob store connected to this project (Storage tab) — the server disk is read-only.');
  }
  const dir = path.join(LOCAL_DIR, companyId);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await fs.writeFile(file, gz);
  const pruned = await pruneLocalBackups(dir, createdAt);
  return { where: 'local', location: file, bytes: gz.length, pruned };
}

function cutoff(now: Date): number {
  return now.getTime() - BACKUP_RETENTION_DAYS * 86_400_000;
}

async function pruneBlobBackups(companyId: string, now: Date): Promise<number> {
  const stale: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `backups/${companyId}/`, cursor, limit: 1000 });
    for (const b of page.blobs) if (new Date(b.uploadedAt).getTime() < cutoff(now)) stale.push(b.url);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (stale.length) await del(stale);
  return stale.length;
}

async function pruneLocalBackups(dir: string, now: Date): Promise<number> {
  let pruned = 0;
  for (const entry of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!/^invozy-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(entry)) continue;
    const file = path.join(dir, entry);
    const stat = await fs.stat(file).catch(() => null);
    if (stat && stat.mtimeMs < cutoff(now)) {
      await fs.unlink(file).catch(() => {});
      pruned++;
    }
  }
  return pruned;
}

/** Removes a company's stored nightly backups — for a permanent company
 * deletion. Never throws. */
export async function deleteCompanyBackups(companyId: string): Promise<void> {
  if (!/^[a-z0-9]+$/i.test(companyId)) return;
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: `backups/${companyId}/`, cursor, limit: 1000 });
        if (page.blobs.length) await del(page.blobs.map((b) => b.url));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return;
    }
    await fs.rm(path.join(LOCAL_DIR, companyId), { recursive: true, force: true });
  } catch (e) {
    console.error(`Deleting backups of company ${companyId} failed`, e);
  }
}
