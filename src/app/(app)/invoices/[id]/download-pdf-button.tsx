'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** A real one-click file download — distinct from PrintButton's
 * window.print() (which only opens the browser's print dialog and leaves
 * "save as PDF" up to the user). Fetches the server-rendered PDF
 * (src/app/api/invoices/[id]/pdf/route.ts) as a blob and saves it via a
 * throwaway object-URL anchor, so we can show a loading state while the
 * headless render (a couple of seconds) is in flight. */
export function DownloadPdfButton({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `PDF generation failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not generate the PDF');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {pending ? 'Preparing…' : 'Download PDF'}
    </Button>
  );
}
