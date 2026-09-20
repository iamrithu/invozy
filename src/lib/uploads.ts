import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { put, del } from '@vercel/blob';

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type UploadKind = 'products' | 'company' | 'signature';

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
export async function saveUploadedImage(file: File, companyId: string, kind: UploadKind): Promise<string> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error('Only JPG, PNG, or WEBP images are allowed.');
  if (file.size > MAX_BYTES) throw new Error('Images must be 4MB or smaller.');

  const filename = `${randomUUID()}.${ext}`;

  if (useBlob) {
    const blob = await put(`${companyId}/${kind}/${filename}`, file, { access: 'public', contentType: file.type });
    return blob.url;
  }

  // No Blob token configured — on a serverless host the filesystem below is
  // read-only (public/uploads can't be created), so failing fast here with
  // an actionable message beats the raw ENOENT this used to throw when it
  // tried anyway. Connect a Vercel Blob store to this project (Storage tab)
  // so BLOB_READ_WRITE_TOKEN gets auto-injected and the branch above is used.
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    throw new Error('Image uploads need a Vercel Blob store connected to this project — ask an admin to connect one under Storage in the Vercel dashboard.');
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
