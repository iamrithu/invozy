'use client';

import { useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';

const MIN_ZOOM = 60;
const MAX_ZOOM = 150;
const ZOOM_STEP = 10;

/**
 * Dresses the actual invoice HTML (children — the real .invoice-print
 * content, untouched) up to look like a native PDF viewer: a grey canvas
 * behind the page(s), a drop shadow per page, and a small floating
 * page-count/zoom toolbar. Purely cosmetic — the zoom is a CSS transform
 * that's forced back to none in print (see .pdf-zoom-wrap in globals.css),
 * so what actually prints/downloads is always the untransformed page.
 */
export function PdfPreviewChrome({ pageCount, children }: { pageCount: number; children: React.ReactNode }) {
  const [zoom, setZoom] = useState(100);

  return (
    <div>
      <div className="sticky top-3 z-10 mb-3 flex justify-center print:hidden">
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 shadow-elevated">
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            className="flex h-6 w-6 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt disabled:opacity-40"
          >
            <Minus size={13} />
          </button>
          <button onClick={() => setZoom(100)} aria-label="Reset zoom" className="min-w-[38px] text-center font-mono text-[11.5px] font-bold text-ink-soft hover:text-ink">
            {zoom}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="flex h-6 w-6 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
          {zoom !== 100 && (
            <button onClick={() => setZoom(100)} aria-label="Reset zoom to 100%" className="flex h-6 w-6 items-center justify-center rounded-full text-ink-faint hover:bg-surface-alt hover:text-ink-soft">
              <RotateCcw size={12} />
            </button>
          )}
          <span className="h-4 w-px bg-line" />
          <span className="whitespace-nowrap text-[11.5px] font-bold text-ink-faint">
            Page 1{pageCount > 1 ? `–${pageCount}` : ''} of {pageCount}
          </span>
        </div>
      </div>
      <div className="rounded-xl2 bg-[#525659] p-6 print:m-0 print:rounded-none print:bg-transparent print:p-0">
        {/* No width constraint here (no w-fit/mx-auto) — .invoice-print inside
            already centers itself (mx-auto max-w-[760px]). Giving *this*
            wrapper a fit-content width breaks print: .invoice-print becomes
            position:absolute for print, dropping out of flow, so a
            fit-content parent would collapse to ~0 width with nothing left
            to size itself against. */}
        <div className="pdf-zoom-wrap transition-transform" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
