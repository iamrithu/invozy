import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireUser } from '@/lib/session';
import { PURCHASE_ATTACHMENT_MAX_BYTES, PURCHASE_ATTACHMENT_TYPES } from '@/components/purchases/purchase-math';

export const dynamic = 'force-dynamic';

/**
 * Issues the short-lived token a browser needs to upload a purchase
 * attachment straight to Vercel Blob — the purchase form's upload path when
 * Blob storage is connected, since a file sent through a function can't be
 * over ~4.5MB. Signed-in users only, only into `purchases/`, only PDFs and
 * photos up to the cap. The file isn't on any bill until savePurchase
 * records it (src/actions/purchases.ts); one that never is gets swept by the
 * nightly cron (src/app/api/cron/backup/route.ts).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        await requireUser();
        if (!/^purchases\/[\w-]+\.(pdf|jpg|png|webp)$/.test(pathname)) throw new Error('That isn’t a bill attachment.');
        return { allowedContentTypes: PURCHASE_ATTACHMENT_TYPES, maximumSizeInBytes: PURCHASE_ATTACHMENT_MAX_BYTES, addRandomSuffix: false };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Upload refused.' }, { status: 400 });
  }
}
