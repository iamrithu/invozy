'use client';

import { useState } from 'react';
import { Download, Info, Landmark, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFormBody, DialogFormContent, DialogFormFooter, DialogFormHeader, DialogFormIcon, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { GSTR1_SECTIONS, type Gstr1Section } from '@/lib/gstr1';
import { downloadFile, rangeQuery } from './download-file';

/** GSTR-1 for the selected period, one CSV per return section in the GST
 * offline tool's layout (src/lib/gstr1.ts) — a download button per
 * section, or all of them in turn. There's no zip library in the app, so
 * the files come separately; the browser may ask once to allow several
 * downloads. Owner only (the routes check again). */
export function Gstr1Dialog({ open, onOpenChange, range, rangeLabel }: { open: boolean; onOpenChange: (open: boolean) => void; range: { from?: string; to?: string }; rangeLabel: string }) {
  const [busy, setBusy] = useState<Gstr1Section | 'all' | null>(null);
  const bounded = !!range.from && !!range.to;

  const fetchOne = (id: Gstr1Section) => downloadFile(`/api/export/gstr1/${id}${rangeQuery(range)}`, `asb-gstr1-${id}.csv`);

  async function one(id: Gstr1Section) {
    setBusy(id);
    try {
      await fetchOne(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setBusy(null);
    }
  }

  async function all() {
    setBusy('all');
    try {
      for (const s of GSTR1_SECTIONS) await fetchOne(s.id);
      toast.success('GSTR-1 files downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogFormContent>
        <DialogFormHeader>
          <DialogFormIcon>
            <Landmark size={16} />
          </DialogFormIcon>
          <div>
            <DialogTitle>GSTR-1 · {rangeLabel}</DialogTitle>
            <DialogDescription>CSV files in the GST offline tool&apos;s layout, one per section.</DialogDescription>
          </div>
        </DialogFormHeader>

        <DialogFormBody className="space-y-3">
          {!bounded && (
            <p className="flex items-start gap-1.5 rounded-sm2 bg-gold-soft px-3 py-2 text-[12px] leading-relaxed text-ink-body">
              <Info size={13} className="mt-0.5 flex-shrink-0 text-gold" />
              GSTR-1 is filed for one month (or quarter). Pick that period in the Reports date filter first — these files cover {rangeLabel.toLowerCase()}.
            </p>
          )}
          <ul className="divide-y divide-line rounded-lg2 border border-line">
            {GSTR1_SECTIONS.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-ink">{s.label}</div>
                  <div className="text-[11px] text-ink-faint">{s.hint}</div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => one(s.id)} disabled={!!busy} aria-label={`Download ${s.label}`} title={`Download ${s.label}`}>
                  {busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Customers with a GSTIN are B2B; credit notes to customers without one are netted into B2C small. Check the GSTINs and HSN codes before you upload.
          </p>
        </DialogFormBody>

        <DialogFormFooter>
          <Button type="button" size="sm" onClick={all} disabled={!!busy}>
            {busy === 'all' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download all
          </Button>
        </DialogFormFooter>
      </DialogFormContent>
    </Dialog>
  );
}
