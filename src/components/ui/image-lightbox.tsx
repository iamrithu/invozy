'use client';

import { useState } from 'react';
import { Expand } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Wraps an existing thumbnail/preview `<img>` so clicking it opens a
 * full-screen view — used wherever a product photo or company logo is
 * displayed (not the picker's own remove/replace controls). */
export function ZoomableImage({ src, alt = '', className, imgClassName }: { src: string; alt?: string; className?: string; imgClassName?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-lg2 object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
