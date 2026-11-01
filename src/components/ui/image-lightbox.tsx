'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Wraps an existing thumbnail/preview `<img>` so clicking it opens a
 * full-screen view — used wherever a product/customer photo or company logo
 * is displayed (not the picker's own remove/replace controls). Pass
 * `gallery` (every photo in the set, including `src`) to page through them
 * with arrows or the ←/→ keys. */
export function ZoomableImage({
  src,
  alt = '',
  className,
  imgClassName,
  gallery,
}: {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  gallery?: string[];
}) {
  const [open, setOpen] = useState(false);
  const photos = gallery && gallery.length > 0 ? gallery : [src];
  const [index, setIndex] = useState(0);
  const many = photos.length > 1;

  function step(delta: number) {
    setIndex((i) => (i + delta + photos.length) % photos.length);
  }

  useEffect(() => {
    if (!open || !many) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, many, photos.length]);

  const current = photos[Math.min(index, photos.length - 1)] ?? src;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIndex(Math.max(photos.indexOf(src), 0));
          setOpen(true);
        }}
        className={cn('group relative block h-full w-full', className)}
        aria-label="View full size"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={cn('h-full w-full object-cover', imgClassName)} />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <Expand size={16} />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-[90vw] items-center justify-center border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{alt || 'Photo'}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-lg2 object-contain" />
          {many && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm2 bg-black/55 text-white transition-colors hover:bg-black/75"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm2 bg-black/55 text-white transition-colors hover:bg-black/75"
              >
                <ChevronRight size={18} />
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-sm2 bg-black/55 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                {index + 1}/{photos.length}
              </span>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
