'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Opens the real server-generated PDF (src/app/api/invoices/[id]/pdf/route.ts)
 * in a new tab instead of calling window.print() on this HTML page. Printing
 * the live page left the browser's own print dialog free to inject its
 * default page-title-and-URL header and date/page-number footer around the
 * invoice — a page's CSS has no way to suppress that, since it's a print-
 * dialog setting, not part of the document. The PDF opens in the browser's
 * native PDF viewer instead, which prints the document as-is with no header
 * of its own — same clean A4 output as the Download button. */
export function PrintButton({ invoiceId }: { invoiceId: string }) {
  return (
    <Button onClick={() => window.open(`/api/invoices/${invoiceId}/pdf?inline=1`, '_blank')}>
      <Printer size={13} /> Print / download
    </Button>
  );
}
