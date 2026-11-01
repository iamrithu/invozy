'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';

/** Fetches a server-rendered PDF and saves it under `fileName`. A plain
 * `<a download>` would save the route's JSON error body as a broken file
 * when a render fails; this shows the real reason in a toast instead.
 * Throws so callers can keep their own pending state. */
export async function downloadPdf(href: string, fileName: string) {
  const res = await fetch(href);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Could not prepare the PDF (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** One-click download for any of the /api/pdf/** routes (credit notes,
 * receipts, statements) — a spinner while the headless render runs, a
 * toast if it fails. `iconOnly` renders the compact table-row version. */
export function PdfDownloadButton({
  href,
  fileName,
  label = 'Download PDF',
  iconOnly = false,
  variant = 'outline',
  size = 'sm',
  className,
}: {
  href: string;
  fileName: string;
  label?: string;
  iconOnly?: boolean;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await downloadPdf(href, fileName);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not prepare the PDF');
    } finally {
      setPending(false);
    }
  }

  const icon = pending ? <Loader2 size={iconOnly ? 14 : 13} className="animate-spin" /> : <Download size={iconOnly ? 14 : 13} />;
  if (iconOnly) {
    return (
      <Button type="button" size="icon" variant="ghost" aria-label={label} title={label} className={className ?? 'h-8 w-8'} onClick={handleClick} disabled={pending}>
        {icon}
      </Button>
    );
  }
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={handleClick} disabled={pending}>
      {icon} {pending ? 'Preparing…' : label}
    </Button>
  );
}
