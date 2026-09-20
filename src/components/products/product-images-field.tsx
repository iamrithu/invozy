'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

export type PendingImages = { existing: string[]; files: File[] };

const MAX_IMAGES = 6;

/** Shared image picker for the product create/edit forms. Kept URLs and
 * newly-picked files both live in parent state (not the native file input),
 * so individual thumbnails — old or new — can be removed before submit; the
 * form's onSubmit reads this state directly instead of relying on the
 * file input's FileList. */
export function ProductImagesField({ value, onChange, max = MAX_IMAGES }: { value: PendingImages; onChange: (v: PendingImages) => void; max?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = value.files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [value.files]);

  const count = value.existing.length + value.files.length;

  function pickFiles(fileList: FileList | null) {
    if (!fileList) return;
    const room = Math.max(max - count, 0);
    const picked = Array.from(fileList).slice(0, room);
    if (picked.length > 0) onChange({ ...value, files: [...value.files, ...picked] });
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold text-ink-faint">
        Photos ({count}/{max})
      </label>
      <div className="flex flex-wrap gap-2">
        {value.existing.map((url) => (
          <div key={url} className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md2 border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange({ ...value, existing: value.existing.filter((u) => u !== url) })}
              aria-label="Remove photo"
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm2 bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {value.files.map((file, i) => (
          <div key={`${file.name}-${i}`} className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md2 border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {previews[i] && <img src={previews[i]} alt="" className="h-full w-full object-cover" />}
            <button
              type="button"
              onClick={() => onChange({ ...value, files: value.files.filter((_, fi) => fi !== i) })}
              aria-label="Remove photo"
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm2 bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {count < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-md2 border border-dashed border-line text-ink-faint hover:border-brand hover:text-brand"
          >
            <ImagePlus size={16} />
            <span className="text-[9px] font-bold">Add</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pickFiles(e.target.files)} />
      {count === 0 && <p className="mt-1.5 text-[11px] text-ink-faint">Optional, but products with a photo look more professional on invoices and in your catalog.</p>}
    </div>
  );
}
