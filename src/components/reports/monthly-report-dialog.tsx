'use client';

import { useState } from 'react';
import { FileText, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogFormBody, DialogFormContent, DialogFormFooter, DialogFormHeader, DialogFormIcon, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { todayIst } from '@/lib/dates';
import { isReportMonth, lastCompleteMonth, monthLabel, monthlyReportFileName } from '@/app/print/monthly-report/month';
import { downloadFile } from './download-file';

/** "Monthly report PDF" — pick a month (last complete month by default)
 * and download that month's report: key figures against the month before,
 * top customers and products, collections, receivables and GST. Owner
 * only (the route checks again). */
export function MonthlyReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [month, setMonth] = useState(() => lastCompleteMonth(todayIst()));
  const [pending, setPending] = useState(false);
  const thisMonth = todayIst().slice(0, 7);
  const valid = isReportMonth(month) && month <= thisMonth;

  async function download() {
    if (!valid) return;
    setPending(true);
    try {
      await downloadFile(`/api/pdf/monthly-report?month=${month}`, monthlyReportFileName(month));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not prepare the report.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogFormContent className="max-w-[420px]">
        <DialogFormHeader>
          <DialogFormIcon>
            <FileText size={16} />
          </DialogFormIcon>
          <div>
            <DialogTitle>Monthly report PDF</DialogTitle>
            <DialogDescription>Sales, profit, collections, dues and GST for one month, against the month before.</DialogDescription>
          </div>
        </DialogFormHeader>
        <DialogFormBody>
          <Label htmlFor="monthly-report-month">Month</Label>
          <Input id="monthly-report-month" type="month" value={month} max={thisMonth} onChange={(e) => setMonth(e.target.value)} className="font-mono" />
          {(!valid || month === thisMonth) && (
            <p className="mt-1 text-[11px] text-ink-faint">{valid ? `${monthLabel(month)} so far — the figures will change until the month ends.` : 'Pick a month up to this one.'}</p>
          )}
        </DialogFormBody>
        <DialogFormFooter>
          <Button type="button" size="sm" onClick={download} disabled={!valid || pending}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {pending ? 'Preparing…' : 'Download PDF'}
          </Button>
        </DialogFormFooter>
      </DialogFormContent>
    </Dialog>
  );
}
