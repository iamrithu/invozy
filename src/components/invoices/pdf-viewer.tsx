'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// react-pdf renders via pdf.js, which does its heavy lifting in a Web
// Worker — this loads that worker script from the same CDN mirror as the
// exact pdfjs-dist version pinned in package.json (kept in lockstep by
// react-pdf's own dependency), so there's never a version mismatch between
// the worker and the main-thread library.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const MAX_PAGE_WIDTH = 900;

/**
 * Canvas-rendered PDF viewer (via pdf.js) — unlike an <iframe src="...pdf">,
 * this doesn't depend on the browser's own built-in PDF plugin, which most
 * mobile browsers don't reliably expose inside an iframe (confirmed via
 * real-device testing: the preview was just a blank box on mobile). This
 * renders identically everywhere, and — just as importantly — actually
 * surfaces a real error message on failure instead of a silent blank frame,
 * which matters while the server-side PDF generation on Vercel is still
 * being diagnosed.
 *
 * Pages are sized to fit the available container width (measured via
 * ResizeObserver) rather than a fixed CSS scale — a real A4 page rendered
 * at its native size is wider than most phone screens, which just meant
 * side-scrolling to read anything. `scale` is a multiplier on top of that
 * fitted width (1 = fits exactly), driven by the zoom controls.
 */
export function PdfViewer({ src, scale = 1, onNumPages }: { src: string; scale?: number; onNumPages?: (n: number) => void }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageWidth = containerWidth ? Math.min(containerWidth, MAX_PAGE_WIDTH) * scale : undefined;

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-[900px]">
      <Document
        file={src}
        onLoadSuccess={({ numPages }) => {
          setNumPages(numPages);
          setError(null);
          onNumPages?.(numPages);
        }}
        onLoadError={(e) => setError(e.message || 'Could not load the PDF.')}
        loading={
          <div className="flex h-[70vh] items-center justify-center gap-2 text-[13px] font-semibold text-ink-faint">
            <Loader2 size={16} className="animate-spin" /> Generating PDF…
          </div>
        }
        error={
          <div className="flex h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
            <AlertTriangle size={22} className="text-destructive" />
            <div className="text-[13.5px] font-bold text-ink">Couldn&apos;t load the PDF</div>
            {error && <div className="max-w-[420px] text-[11.5px] text-ink-faint">{error}</div>}
            <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </div>
        }
        className="flex flex-col items-center gap-4"
      >
        {Array.from({ length: numPages ?? 0 }, (_, i) => (
          <Page key={i} pageNumber={i + 1} width={pageWidth} className="shadow-elevated" />
        ))}
      </Document>
    </div>
  );
}
