import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { put, del, list } from '@vercel/blob';
import { currentCompanyId, isViewOnly, ViewOnlyError } from './tenant';

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
// Reference documents (a purchase's bill copies) can also be PDFs.
const DOCUMENT_TYPES: Record<string, string> = { ...ALLOWED_TYPES, 'application/pdf': 'pdf' };

export type UploadKind = 'products' | 'customers' | 'company' | 'signature' | 'purchases' | 'categories';

/** Vercel's serverless functions have a read-only filesystem (aside from
 * /tmp, which doesn't persist or get served publicly) — writing to
 * public/uploads only works on a persistent Node server (e.g. local dev).
 * `BLOB_READ_WRITE_TOKEN` is auto-injected once a Blob store is connected to
 * the Vercel project, so its presence is what picks the storage backend —
 * nothing to configure by hand in either environment. */
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

/** Saves an uploaded image and returns the URL it's served at (a Vercel Blob
 * URL in production, or a local /uploads/... path in dev). Throws a plain
 * Error with a user-facing message on invalid type/size — callers surface it
 * as a field error. */
export async function saveUploadedImage(file: File, kind: UploadKind): Promise<string> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error('Only JPG, PNG, or WEBP images are allowed.');
  if (file.size > MAX_BYTES) throw new Error('Images must be 4MB or smaller.');
  return store(file, kind, ext);
}

/** saveUploadedImage for reference documents — a PDF or an image, same
 * size cap and storage. */
export async function saveUploadedDocument(file: File, kind: UploadKind): Promise<string> {
  const ext = DOCUMENT_TYPES[file.type];
  if (!ext) throw new Error(`"${file.name}" isn't a PDF, JPG, PNG or WEBP file.`);
  if (file.size > MAX_BYTES) throw new Error(`"${file.name}" is over 4MB.`);
  return store(file, kind, ext);
}

/** Where `companyId`'s files of one kind live: `<companyId>/<kind>/` — the
 * layout the original multi-company Invozy already used for logos and
 * product images, so those existing files keep resolving. */
export function uploadPrefix(companyId: string, kind: UploadKind): string {
  return `${companyId}/${kind}/`;
}

/** Whether `url` is a file this app stored under `kind` for `companyId` —
 * URLs that come back from the client are checked with this before they're
 * saved or deleted, so a record can only ever point at (and a delete can
 * only ever remove) the company's own uploads. */
export function isOwnUpload(url: string, kind: UploadKind, companyId: string): boolean {
  if (!companyId) return false;
  if (url.startsWith('/uploads/')) {
    const resolved = path.join(process.cwd(), 'public', url);
    return resolved.startsWith(path.join(UPLOAD_ROOT, companyId, kind) + path.sep);
  }
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.blob.vercel-storage.com') && u.pathname.startsWith(`/${uploadPrefix(companyId, kind)}`);
  } catch {
    return false;
  }
}

async function store(file: File, kind: UploadKind, ext: string): Promise<string> {
  if (await isViewOnly()) throw new ViewOnlyError();
  const filename = `${randomUUID()}.${ext}`;
  const companyId = await currentCompanyId();

  if (useBlob) {
    const blob = await put(`${uploadPrefix(companyId, kind)}${filename}`, file, { access: 'public', contentType: file.type });
    return blob.url;
  }

  // No Blob token configured — on a serverless host the filesystem below is
  // read-only (public/uploads can't be created), so failing fast here with
  // an actionable message beats the raw ENOENT this used to throw when it
  // tried anyway. Connect a Vercel Blob store to this project (Storage tab)
  // so BLOB_READ_WRITE_TOKEN gets auto-injected and the branch above is used.
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    throw new Error('Uploads need a Vercel Blob store connected to this project — connect one under Storage in the Vercel dashboard.');
  }

  const dir = path.join(UPLOAD_ROOT, companyId, kind);
  await fs.mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/uploads/${companyId}/${kind}/${filename}`;
}

/** Best-effort delete — never throws, since the file may already be gone
 * (or the URL may be stale/foreign, e.g. left over from before a switch
 * between local/Blob storage) by the time this runs. Local-path deletes are
 * path-traversal guarded because the URL ultimately comes from DB data, not
 * a trusted constant. */
export async function deleteUploadedImage(url: string): Promise<void> {
  if (url.includes('blob.vercel-storage.com')) {
    try {
      await del(url);
    } catch {
      // already gone, or this store's token has since changed — nothing to do
    }
    return;
  }

  if (!url.startsWith('/uploads/')) return;
  const resolved = path.join(process.cwd(), 'public', url);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) return;
  try {
    await fs.unlink(resolved);
  } catch {
    // already gone — nothing to do
  }
}

/** Deletes Blob files under `<companyId>/<kind>/` older than `minAgeMs`
 * that `keep` doesn't list — uploads that never made it onto a record (the
 * browser closed between uploading and saving). Blob storage only; local
 * files are left alone. Returns how many were deleted. */
export async function sweepOrphanUploads(companyId: string, kind: UploadKind, keep: Set<string>, minAgeMs: number): Promise<number> {
  if (!useBlob || !companyId) return 0;
  const cutoff = Date.now() - minAgeMs;
  const stale: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: uploadPrefix(companyId, kind), cursor, limit: 1000 });
    for (const b of page.blobs) if (!keep.has(b.url) && b.uploadedAt.getTime() < cutoff) stale.push(b.url);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (stale.length) await del(stale);
  return stale.length;
}

/** Removes every file a company uploaded (logos, signatures, product and
 * customer photos, bill attachments) — for a permanent company deletion.
 * Blob: everything under `<companyId>/`; local: public/uploads/<companyId>.
 * Returns how many files were removed. Never throws. */
export async function deleteCompanyUploads(companyId: string): Promise<number> {
  if (!/^[a-z0-9]+$/i.test(companyId)) return 0;
  try {
    if (useBlob) {
      let removed = 0;
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: `${companyId}/`, cursor, limit: 1000 });
        if (page.blobs.length) await del(page.blobs.map((b) => b.url));
        removed += page.blobs.length;
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return removed;
    }
    const dir = path.join(UPLOAD_ROOT, companyId);
    if (!dir.startsWith(UPLOAD_ROOT + path.sep)) return 0;
    await fs.rm(dir, { recursive: true, force: true });
    return 1;
  } catch (e) {
    console.error(`Deleting uploads of company ${companyId} failed`, e);
    return 0;
  }
}
