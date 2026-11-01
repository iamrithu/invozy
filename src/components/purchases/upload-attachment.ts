import { upload } from '@vercel/blob/client';
import { uploadPurchaseAttachment, type PurchaseAttachmentInfo } from '@/actions/purchases';

// What src/lib/uploads.ts accepts through the server action.
const SERVER_MAX_BYTES = 4 * 1024 * 1024;
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Uploads one bill attachment and returns it, ready for savePurchase.
 * With Blob storage connected (`direct`), the browser sends it straight
 * there (see /api/uploads/purchases) — any size up to the cap. Otherwise,
 * or if that fails for a file small enough, it goes through the server
 * action, one file per request. */
export async function uploadAttachment(file: File, direct: boolean): Promise<PurchaseAttachmentInfo> {
  const name = file.name.slice(0, 200) || 'Attachment';
  if (direct) {
    try {
      const blob = await upload(`purchases/${crypto.randomUUID()}.${EXT[file.type] ?? 'bin'}`, file, {
        access: 'public',
        handleUploadUrl: '/api/uploads/purchases',
        contentType: file.type,
      });
      return { url: blob.url, name, contentType: file.type, size: file.size };
    } catch (e) {
      if (file.size > SERVER_MAX_BYTES) throw new Error(`Couldn’t upload "${file.name}": ${(e as Error).message}`);
    }
  }
  const fd = new FormData();
  fd.append('file', file);
  const res = await uploadPurchaseAttachment(fd);
  if (res.error || !res.attachment) throw new Error(res.error ?? `Couldn’t upload "${file.name}". Try again.`);
  return res.attachment;
}
