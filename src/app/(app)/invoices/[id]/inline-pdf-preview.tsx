'use client';

import { useState } from 'react';
import { FileText, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PdfViewerDialog } from '@/components/invoices/pdf-viewer-dialog';

/** A slim entry point to the real server-generated PDF, opened in the
 * full-screen PdfViewerDialog on click. Earlier versions rendered the PDF
 * inline right here (an 80vh scroll box embedded in the page) with a link
 * out to a separate /preview route for more room — in practice neither gave
 * the PDF enough space to be genuinely readable, so both are gone in favor
 * of one consistent full-screen viewer. */
export function InlinePdfPreview({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto mb-5 flex max-w-[760px] items-center justify-between gap-3 rounded-xl2 border border-line bg-surface px-4 py-3 shadow-card print:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
          <FileText size={15} />
        </span>
        <div className="min-w-0 text-[12.5px] font-semibold text-ink-soft">View the exact PDF this invoice downloads as.</div>
      </div>
      <Button size="sm" onClick={() => setOpen(true)} className="flex-none">
        <Maximize2 size={13} /> View PDF
      </Button>
      <PdfViewerDialog invoiceId={invoiceId} invoiceNumber={invoiceNumber} open={open} onOpenChange={setOpen} />
    </div>
  );
}
