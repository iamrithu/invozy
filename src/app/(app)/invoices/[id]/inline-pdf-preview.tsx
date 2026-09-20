'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Loader2, Maximize2 } from 'lucide-react';

// react-pdf's <Document>/<Page> touch `window`/`document` while rendering
// (pdf.js internals), which crashes with "document is not defined" during
// Next's server-side render of this client component — ssr:false is
// required so it only ever mounts in the browser.
const PdfViewer = dynamic(() => import('@/components/invoices/pdf-viewer').then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center gap-2 text-[13px] font-semibold text-white/70">
      <Loader2 size={16} className="animate-spin" /> Generating PDF…
    </div>
  ),
});

/** Shows the real server-generated PDF right on the invoice detail page
 * (via pdf.js/canvas — works identically on every device, unlike an
 * embedded <iframe> relying on the browser's own PDF plugin) instead of
 * making it a click-through card. "Open full view" still links to the
 * dedicated /preview route for zoom controls and more room. */
export function InlinePdfPreview({ invoiceId }: { invoiceId: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-[900px] overflow-hidden rounded-xl2 border border-line shadow-card print:hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface-alt px-3.5 py-2">
        <span className="text-[11.5px] font-bold text-ink-soft">{numPages !== null ? (numPages === 1 ? '1 page' : `${numPages} pages`) : 'Preview'}</span>
        <Link href={`/invoices/${invoiceId}/preview`} className="flex items-center gap-1.5 text-[11.5px] font-bold text-brand hover:text-brand-dark">
          <Maximize2 size={12} /> Open full view
        </Link>
      </div>
      <div className="max-h-[80vh] overflow-y-auto bg-[#525659] p-4 sm:p-6">
        <PdfViewer src={`/api/invoices/${invoiceId}/pdf?inline=1`} onNumPages={setNumPages} />
      </div>
    </div>
  );
}
