'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

export type PendingImages = { existing: string[]; files: File[] };

const MAX_IMAGES = 6;
// Must match src/lib/uploads.ts — checked here too so a bad pick is refused
// on the spot with its file name, not after a long upload.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Phone camera photos are routinely 3–8MB; anything above this is scaled
// down before upload, which keeps a 6-photo save well inside the server's
// request limit (and Vercel's own ~4.5MB per-request cap) and loads faster.
const SHRINK_ABOVE_BYTES = 1024 * 1024;
const MAX_EDGE_PX = 1600;

/** Scales a large photo down to MAX_EDGE_PX on its longest side and
 * re-encodes it (JPEG for photos, WEBP for PNGs so transparency survives
 * where the browser supports it). Falls back to the original file whenever
 * that doesn't produce something smaller. */
export async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    // An <img> applies the photo's EXIF rotation, so the drawn copy keeps
    // the orientation the camera meant.
    await img.decode();
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const wanted = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, wanted, 0.85));
    if (!blob || blob.size >= file.size || !ALLOWED_TYPES.includes(blob.type)) return file;
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${ext}`, { type: blob.type });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shared photo picker for the product and customer forms. Kept URLs and
 * newly-picked files both live in parent state (not the native file input),
 * so individual thumbnails — old or new — can be removed before submit; the
 * form's onSubmit reads this state directly instead of relying on the file
 * input's FileList. Every picked file is checked (type, ≤4MB after
 * shrinking) before it's accepted, with a message naming the file. */
export function ImagesField({
  value,
  onChange,
  max = MAX_IMAGES,
  emptyHint = 'Optional, but products with a photo look more professional on invoices and in your catalog.',
}: {
  value: PendingImages;
  onChange: (v: PendingImages) => void;
  max?: number;
  emptyHint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const urls = value.files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [value.files]);

  const count = value.existing.length + value.files.length;

  async function pickFiles(fileList: FileList | null) {
    const picked = Array.from(fileList ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (!picked.length) return;
    setBusy(true);
    const problems: string[] = [];
    const accepted: File[] = [];
    const room = Math.max(max - count, 0);
    for (const file of picked) {
      if (accepted.length >= room) {
        problems.push(`Only ${max} photos fit — the rest were skipped.`);
        break;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        problems.push(`"${file.name}" isn't a JPG, PNG or WEBP photo.`);
        continue;
      }
      const ready = await shrinkPhoto(file);
      if (ready.size > MAX_BYTES) {
        problems.push(`"${file.name}" is over 4MB. Pick a smaller photo.`);
        continue;
      }
      accepted.push(ready);
    }
    setBusy(false);
    if (accepted.length) onChange({ ...value, files: [...value.files, ...accepted] });
    const message = problems.length ? problems.join(' ') : null;
    setProblem(message);
    if (message) toast.error(message);
  }

  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold text-ink-faint">
        Photos ({count}/{max})
      </label>
      <div className="flex flex-wrap gap-2">
        {value.existing.map((url) => (
          <Thumb key={url} src={url} onRemove={() => onChange({ ...value, existing: value.existing.filter((u) => u !== url) })} />
        ))}
        {value.files.map((file, i) => (
          <Thumb key={`${file.name}-${i}`} src={previews[i]} onRemove={() => onChange({ ...value, files: value.files.filter((_, fi) => fi !== i) })} />
        ))}
        {count < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-md2 border border-dashed border-line text-ink-faint hover:border-brand hover:text-brand disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
            <span className="text-[9px] font-bold">{busy ? 'Preparing' : 'Add'}</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pickFiles(e.target.files)} />
      {problem ? (
        <p className="mt-1.5 text-[11px] font-semibold text-destructive">{problem}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-ink-faint">{count === 0 ? emptyHint : 'JPG, PNG or WEBP, up to 4MB each. Large photos are shrunk automatically.'}</p>
      )}
    </div>
  );
}

function Thumb({ src, onRemove }: { src?: string; onRemove: () => void }) {
  return (
    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md2 border border-line bg-surface-alt">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
      {/* Always visible — a hover-only button can't be reached on a phone. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-sm2 bg-black/60 text-white transition-colors hover:bg-black/80"
      >
        <X size={11} />
      </button>
    </div>
  );
}

/** The product form's original name for ImagesField. */
export const ProductImagesField = ImagesField;
