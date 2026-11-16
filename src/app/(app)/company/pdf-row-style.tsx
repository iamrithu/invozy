'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { setPdfItemRows } from '@/actions/settings';
import type { PdfItemRows } from '@/lib/settings';
import { cn } from '@/lib/utils';

const OPTIONS: { id: PdfItemRows; name: string; blurb: string }[] = [
  { id: 'none', name: 'Column lines only', blurb: 'Clean, no line between products.' },
  { id: 'lines', name: 'Line between rows', blurb: 'A thin rule under each product.' },
  { id: 'zebra', name: 'Light shading', blurb: 'Every other row lightly shaded.' },
];

/** How product rows are separated on the Clean invoice and every other
 * printed document (credit notes, receipts, statements). Saves on pick —
 * a style choice, not part of the section's form — and every stored PDF
 * redraws in the new style the next time it's opened. */
export function PdfRowStyle({ value }: { value: PdfItemRows }) {
  const router = useRouter();
  const [current, setCurrent] = useState<PdfItemRows>(value);
  const [pending, start] = useTransition();

  function pick(id: PdfItemRows) {
    if (id === current || pending) return;
    const before = current;
    setCurrent(id);
    start(async () => {
      const res = await setPdfItemRows(id);
      if (res.error) {
        setCurrent(before);
        toast.error(res.error);
        return;
      }
      toast.success('PDF row style saved — invoices redraw in the new style');
      router.refresh();
    });
  }

  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Product rows on PDFs</div>
      <div role="radiogroup" aria-label="Product rows on PDFs" className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {OPTIONS.map((o) => {
          const active = current === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => pick(o.id)}
              className={cn(
                'grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2.5 rounded-lg2 bg-surface text-left transition-colors disabled:opacity-60',
                active ? 'border-2 border-brand p-[7px]' : 'border border-line p-2 hover:border-ink-faint'
              )}
            >
              <RowsThumb id={o.id} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold text-ink">{o.name}</span>
                <span className="block text-[11px] leading-snug text-ink-soft">{o.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint">Applies to the Clean invoice template, credit notes, receipts and statements. Every border stays the same thin line.</p>
    </div>
  );
}

/** A tiny paper table showing the row style — fixed paper colours, like the PDF itself. */
function RowsThumb({ id }: { id: PdfItemRows }) {
  return (
    <span aria-hidden className="block overflow-hidden rounded-[3px] border border-[#6b7280] bg-white">
      <span className="block h-[7px] border-b border-[#6b7280] bg-[#f3f4f6]" />
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'grid h-[7px] grid-cols-[1fr_2.4fr_1fr]',
            id === 'lines' && i > 0 && 'border-t border-[#6b7280]',
            id === 'zebra' && i % 2 === 1 && 'bg-[#e9ebee]'
          )}
        >
          <span />
          <span className="border-l border-[#6b7280]" />
          <span className="border-l border-[#6b7280]" />
        </span>
      ))}
    </span>
  );
}
