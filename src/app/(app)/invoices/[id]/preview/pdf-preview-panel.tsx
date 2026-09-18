'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, Minus, Plus, RotateCcw, Loader2 } from 'lucide-react';
import { DownloadPdfButton } from '@/components/invoices/download-pdf-button';

const MIN_SCALE = 0.6;
const MAX_SCALE = 2;
const SCALE_STEP = 0.15;

// react-pdf's <Document>/<Page> touch `window`/`document` while rendering
// (pdf.js internals), which crashes with "document is not defined" during
// Next's server-side render of this client component — ssr:false is
// required so it only ever mounts in the browser.
const PdfViewer = dynamic(() => import('@/components/invoices/pdf-viewer').then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center gap-2 text-[13px] font-semibold text-white/70">
      <Loader2 size={16} className="animate-spin" /> Loading viewer…
    </div>
  ),
});

/**
 * In-app PDF preview — renders the exact server-generated PDF (the same
 * file DownloadPdfButton saves) via pdf.js (canvas), inside the normal app
 * shell (sidebar/top bar stay visible) rather than a separate full-screen
 * route. Works identically on every device, unlike an embedded
 * <iframe src="...pdf"> relying on the browser's own PDF plugin, which most
 * mobile browsers don't reliably expose inline (confirmed via real-device
 * testing: the preview was just a blank box on mobile).
 */
export function PdfPreviewPanel({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const [scale, setScale] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/invoices/${invoiceId}`} className="flex items-center gap-1.5 text-[13px] font-bold text-ink-soft">
          <ArrowLeft size={15} /> Back to invoice
        </Link>
        <span className="font-mono text-[12.5px] font-bold text-ink-soft">{invoiceNumber}</span>
      </div>

      <div className="overflow-hidden rounded-xl2 border border-line shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/20 bg-chrome px-3 py-2.5 text-white">
          <div className="flex flex-shrink-0 items-center gap-1 rounded-full bg-white/10 px-1 py-1">
            <button
              onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
              disabled={scale <= MIN_SCALE}
              aria-label="Zoom out"
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-40"
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
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-40"
            >
              <Plus size={13} />
            </button>
            {scale !== 1 && (
              <button onClick={() => setScale(1)} aria-label="Reset zoom to 100%" className="flex h-6 w-6 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white/80">
                <RotateCcw size={12} />
              </button>
            )}
          </div>

          {numPages !== null && <span className="hidden flex-shrink-0 whitespace-nowrap text-[11.5px] font-bold text-white/70 sm:inline">{numPages === 1 ? '1 page' : `${numPages} pages`}</span>}

          <div className="ml-auto flex-shrink-0">
            <DownloadPdfButton invoiceId={invoiceId} invoiceNumber={invoiceNumber} />
          </div>
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto bg-[#525659] p-4 sm:p-6">
          <PdfViewer src={`/api/invoices/${invoiceId}/pdf?inline=1`} scale={scale} onNumPages={setNumPages} />
        </div>
      </div>
    </div>
  );
}
