import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type UploadKind = 'products' | 'company';

/** Saves an uploaded image to public/uploads/{companyId}/{kind}/{uuid}.ext
 * and returns the URL path Next.js serves it at. Throws a plain Error with a
 * user-facing message on invalid type/size — callers surface it as a field error. */
export async function saveUploadedImage(file: File, companyId: string, kind: UploadKind): Promise<string> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error('Only JPG, PNG, or WEBP images are allowed.');
  if (file.size > MAX_BYTES) throw new Error('Images must be 4MB or smaller.');

  const dir = path.join(UPLOAD_ROOT, companyId, kind);
  await fs.mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  return `/uploads/${companyId}/${kind}/${filename}`;
}

/** Best-effort delete — never throws, since the file may already be gone
 * (or the URL may be stale/foreign) by the time this runs. Path-traversal
 * guarded because the URL ultimately comes from DB data, not a trusted constant. */
export async function deleteUploadedImage(url: string): Promise<void> {
  if (!url.startsWith('/uploads/')) return;
  const resolved = path.join(process.cwd(), 'public', url);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) return;
  try {
    await fs.unlink(resolved);
  } catch {
    // already gone — nothing to do
  }
}
