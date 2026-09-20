'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFormContent, DialogFormHeader, DialogFormIcon, DialogFormBody } from '@/components/ui/dialog';

type ChecklistItem = {
  label: string;
  done: boolean;
  href?: string;
};

/** A CLASSIC-template-only advisory (print:hidden — never shows on the
 * printed/downloaded PDF itself) listing the Company/Customer/line-item
 * details this invoice format has a place for, so the seller can see at a
 * glance what's still blank before treating the PDF as final. Used on both
 * the invoice builder (while composing) and the saved-invoice detail page.
 * Nothing here is enforced — every one of these fields is optional
 * everywhere else in the app (see e.g. Product/Customer HSN — required only
 * at the point of actually generating a real e-Invoice), this is purely
 * informational. Rendered as a compact alert bar; the full list opens in a
 * dialog via "View" so it doesn't permanently eat page space. */
export function InvoiceCompletenessChecklist({ items, compact }: { items: ChecklistItem[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const missing = items.filter((i) => !i.done);
  if (missing.length === 0) return null;

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-fit flex-shrink-0 items-center gap-1 self-start rounded-sm2 bg-gold-soft px-1.5 py-0.5 text-[10px] font-bold text-ink print:hidden"
        >
          <AlertTriangle size={9} className="flex-shrink-0 text-gold" />
          {missing.length} missing <span className="text-brand underline">View</span>
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogFormContent>
            <DialogFormHeader>
              <DialogFormIcon>
                <AlertTriangle size={16} />
              </DialogFormIcon>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-extrabold text-ink">Complete these for a fully filled-in invoice</div>
                <div className="text-[11.5px] text-ink-faint">Optional, but recommended before treating the PDF as final</div>
              </div>
            </DialogFormHeader>
            <DialogFormBody>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item.label} className={`flex items-center gap-2 text-[13px] ${item.done ? 'text-ink-soft' : 'text-ink-body'}`}>
                    {item.done ? <CheckCircle2 size={15} className="flex-shrink-0 text-green" /> : <Circle size={15} className="flex-shrink-0 text-gold" />}
                    <span className={item.done ? 'line-through decoration-ink-faint' : 'font-semibold'}>{item.label}</span>
                    {!item.done && item.href && (
                      <Link href={item.href} className="ml-auto flex-shrink-0 text-[11.5px] font-bold text-brand hover:underline" onClick={() => setOpen(false)}>
                        Add
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </DialogFormBody>
          </DialogFormContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[760px] items-center gap-2.5 rounded-lg2 border border-gold/40 bg-gold/10 px-3.5 py-2.5 print:hidden">
        <AlertTriangle size={16} className="flex-shrink-0 text-gold" />
        <div className="min-w-0 flex-1 text-[12.5px] font-semibold text-ink">
          {missing.length} {missing.length === 1 ? 'detail' : 'details'} missing for a fully filled-in invoice
        </div>
        <Button type="button" variant="outline" size="sm" className="flex-shrink-0" onClick={() => setOpen(true)}>
          View
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogFormContent>
          <DialogFormHeader>
            <DialogFormIcon>
              <AlertTriangle size={16} />
            </DialogFormIcon>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-extrabold text-ink">Complete these for a fully filled-in invoice</div>
              <div className="text-[11.5px] text-ink-faint">Optional, but recommended before treating the PDF as final</div>
            </div>
          </DialogFormHeader>
          <DialogFormBody>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item.label} className={`flex items-center gap-2 text-[13px] ${item.done ? 'text-ink-soft' : 'text-ink-body'}`}>
                  {item.done ? <CheckCircle2 size={15} className="flex-shrink-0 text-green" /> : <Circle size={15} className="flex-shrink-0 text-gold" />}
                  <span className={item.done ? 'line-through decoration-ink-faint' : 'font-semibold'}>{item.label}</span>
                  {!item.done && item.href && (
                    <Link href={item.href} className="ml-auto flex-shrink-0 text-[11.5px] font-bold text-brand hover:underline" onClick={() => setOpen(false)}>
                      Add
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </DialogFormBody>
        </DialogFormContent>
      </Dialog>
    </>
  );
}
