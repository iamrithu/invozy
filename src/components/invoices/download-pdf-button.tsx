import { Download } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';

/** "ASB/26-27/1020" → "ASB-26-27-1020.pdf" — the same name the PDF route
 * sends (src/lib/invoice-pdf.ts's invoicePdfFileName, kept in step by hand:
 * that module is server-only). */
export function invoicePdfFileName(invoiceNumber: string): string {
  return `${invoiceNumber.replace(/[\\/]+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
}

/** The PDF route for an invoice — a download by default, `inline` to show
 * it in the browser instead. */
export function invoicePdfUrl(invoiceId: string, opts: { inline?: boolean } = {}): string {
  return `/api/invoices/${encodeURIComponent(invoiceId)}/pdf${opts.inline ? '?inline=1' : ''}`;
}

/** A plain link to the PDF route, styled as a button: the browser's own
 * download handles it — instant when the stored PDF is current (it's
 * prebuilt on every save), no blank tab, no blob juggling in JS. `href`
 * overrides the target, e.g. an object URL for a PDF that's already been
 * fetched (see PdfViewerDialog). */
export function DownloadPdfButton({
  invoiceId,
  invoiceNumber,
  href,
  variant = 'outline',
  size = 'sm',
  className,
  label = 'Download PDF',
}: {
  invoiceId: string;
  invoiceNumber: string;
  href?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  label?: string;
}) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <a href={href ?? invoicePdfUrl(invoiceId)} download={invoicePdfFileName(invoiceNumber)}>
        <Download size={13} /> {label}
      </a>
    </Button>
  );
}
