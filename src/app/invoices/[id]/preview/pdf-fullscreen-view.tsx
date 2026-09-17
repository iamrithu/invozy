'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PdfViewer } from '@/components/invoices/pdf-viewer';
import { DownloadPdfButton } from '@/components/invoices/download-pdf-button';

const MIN_SCALE = 0.6;
const MAX_SCALE = 2;
const SCALE_STEP = 0.15;

/**
 * The dedicated full-screen PDF viewing flow — replaces the old embedded
 * <iframe> preview on the invoice detail page, which depended on the
 * browser's own built-in PDF plugin and was just a blank box on most mobile
 * browsers. This renders the same server-generated PDF via pdf.js (canvas,
 * works identically everywhere), with its own zoom/page chrome, in a
 * dedicated route with no app chrome competing for screen space.
 */
export function PdfFullscreenView({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const router = useRouter();
  const [scale, setScale] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#525659]">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-black/20 bg-chrome px-3 py-2.5 text-white">
        <Button variant="ghost" size="icon" className="flex-shrink-0 text-white hover:bg-white/10 hover:text-white" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={16} />
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-bold">{invoiceNumber}</span>

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

        <DownloadPdfButton invoiceId={invoiceId} invoiceNumber={invoiceNumber} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <PdfViewer src={`/api/invoices/${invoiceId}/pdf?inline=1`} scale={scale} onNumPages={setNumPages} />
      </div>
    </div>
  );
}
