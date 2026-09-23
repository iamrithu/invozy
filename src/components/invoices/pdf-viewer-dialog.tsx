'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { Dialog, DialogPortal, DialogOverlay, DialogTrigger } from '@/components/ui/dialog';
import { DownloadPdfButton } from './download-pdf-button';

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.15;
// Generous cap (vs. the 900px default used by the compact inline card) —
// this viewer owns the whole screen, so a page can render large enough to
// read without zooming on anything but the smallest laptop windows.
const DIALOG_MAX_PAGE_WIDTH = 1100;

// react-pdf's <Document>/<Page> touch `window`/`document` while rendering
// (pdf.js internals), which crashes with "document is not defined" during
// Next's server-side render of this client component — ssr:false is
// required so it only ever mounts in the browser.
const PdfViewer = dynamic(() => import('./pdf-viewer').then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center gap-2 text-[13px] font-semibold text-white/70">
      <Loader2 size={16} className="animate-spin" /> Loading viewer…
    </div>
  ),
});

/**
 * True full-viewport PDF viewer — unlike the shared DialogContent's
 * `mobileFullScreen` (full screen only below md, a centered card above it),
 * this fills the whole browser window at every breakpoint. Replaces both
 * the old embedded-in-page preview (cramped into an 80vh scroll box on the
 * invoice detail page) and the separate /preview route (still bounded by
 * the app shell's sidebar/top bar either way) with one consistent
 * full-screen experience — same pdf.js/canvas renderer as before, just
 * given the whole screen to render into instead of a small fixed column.
 */
export function PdfViewerDialog({
  invoiceId,
  invoiceNumber,
  trigger,
  open,
  onOpenChange,
}: {
  invoiceId: string;
  invoiceNumber: string;
  /** Renders as the DialogTrigger (via asChild) when this dialog owns its
   * own open state. Omit and drive `open`/`onOpenChange` instead when the
   * caller wants to open it programmatically. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [scale, setScale] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col bg-[#3a3d3f] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{`Invoice ${invoiceNumber} PDF`}</DialogPrimitive.Title>
          <div className="flex flex-none flex-wrap items-center gap-2 border-b border-black/30 bg-chrome px-3 py-2.5 text-white">
            <span className="mr-1 flex-shrink-0 truncate font-mono text-[12.5px] font-bold text-white/90">{invoiceNumber}</span>

            <div className="flex flex-shrink-0 items-center gap-1 rounded-sm2 bg-white/10 px-1 py-1">
              <button
                onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
                disabled={scale <= MIN_SCALE}
                aria-label="Zoom out"
                className="flex h-6 w-6 items-center justify-center rounded-sm2 text-white/80 hover:bg-white/10 disabled:opacity-40"
              >
                <Minus size={13} />
              </button>
              <button onClick={() => setScale(1)} aria-label="Reset zoom" className="min-w-[38px] text-center font-mono text-[11px] font-bold text-white/80 hover:text-white">
                {Math.round(scale * 100)}%
              </button>
              <button
                onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
                disabled={scale >= MAX_SCALE}
                aria-label="Zoom in"
                className="flex h-6 w-6 items-center justify-center rounded-sm2 text-white/80 hover:bg-white/10 disabled:opacity-40"
              >
                <Plus size={13} />
              </button>
              {scale !== 1 && (
                <button onClick={() => setScale(1)} aria-label="Reset zoom to 100%" className="flex h-6 w-6 items-center justify-center rounded-sm2 text-white/60 hover:bg-white/10 hover:text-white/80">
                  <RotateCcw size={12} />
                </button>
              )}
            </div>

            {numPages !== null && (
              <span className="hidden flex-shrink-0 whitespace-nowrap text-[11.5px] font-bold text-white/70 sm:inline">{numPages === 1 ? '1 page' : `${numPages} pages`}</span>
            )}

            <div className="ml-auto flex flex-shrink-0 items-center gap-2">
              <DownloadPdfButton invoiceId={invoiceId} invoiceNumber={invoiceNumber} />
              <DialogPrimitive.Close
                aria-label="Close"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus:outline-none"
              >
                <X size={16} />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
            <PdfViewer src={`/api/invoices/${invoiceId}/pdf?inline=1`} scale={scale} maxWidth={DIALOG_MAX_PAGE_WIDTH} onNumPages={setNumPages} />
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
