'use client';

import { useEffect, useState } from 'react';
import { Download, FileCode2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogFormBody, DialogFormContent, DialogFormFooter, DialogFormHeader, DialogFormIcon, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTallyLedgers, useUpdateTallyLedgers } from '@/hooks/use-reports';
import { DEFAULT_TALLY_LEDGERS, TALLY_LEDGER_FIELDS, type TallyLedgers } from '@/lib/tally';
import { downloadFile, rangeQuery } from './download-file';

/** "Tally ledger names" — what the Tally voucher export posts to. The
 * names must match ledgers in the accountant's Tally company exactly, so
 * they're editable here; the ledger file (Import → Masters) creates any
 * that are missing, along with one ledger per customer. Owner only. */
export function TallyDialog({ open, onOpenChange, range }: { open: boolean; onOpenChange: (open: boolean) => void; range: { from?: string; to?: string } }) {
  const { data: saved, isLoading } = useTallyLedgers(open);
  const update = useUpdateTallyLedgers();
  const [draft, setDraft] = useState<TallyLedgers>(DEFAULT_TALLY_LEDGERS);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open && saved) setDraft(saved);
  }, [open, saved]);

  const dirty = !!saved && TALLY_LEDGER_FIELDS.some((f) => draft[f.key].trim() !== saved[f.key]);

  async function save() {
    try {
      await update.mutateAsync(draft);
      toast.success('Tally ledger names saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the ledger names.');
    }
  }

  async function downloadMasters() {
    setDownloading(true);
    try {
      if (dirty) await update.mutateAsync(draft);
      await downloadFile(`/api/export/tally${rangeQuery(range, { part: 'masters' })}`, 'asb-tally-ledgers.xml');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogFormContent>
        <DialogFormHeader>
          <DialogFormIcon>
            <FileCode2 size={16} />
          </DialogFormIcon>
          <div>
            <DialogTitle>Tally ledger names</DialogTitle>
            <DialogDescription>Must match the ledger names in your Tally company.</DialogDescription>
          </div>
        </DialogFormHeader>

        <DialogFormBody className="space-y-3">
          <p className="rounded-sm2 bg-gold-soft px-3 py-2 text-[12px] leading-relaxed text-ink-body">
            Create these ledgers in Tally first, then <b>Import → Vouchers</b>. Missing ledgers? Download the ledger file below and import it with{' '}
            <b>Import → Masters</b> first — it also adds a ledger for every customer in this period.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TALLY_LEDGER_FIELDS.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`tally-${f.key}`}>{f.label}</Label>
                <Input
                  id={`tally-${f.key}`}
                  value={draft[f.key]}
                  disabled={isLoading}
                  placeholder={DEFAULT_TALLY_LEDGERS[f.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
                <p className="mt-0.5 text-[10.5px] text-ink-faint">Under {f.group}</p>
              </div>
            ))}
          </div>
        </DialogFormBody>

        <DialogFormFooter className="justify-between">
          <Button type="button" variant="outline" size="sm" onClick={downloadMasters} disabled={downloading || isLoading}>
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Ledger file
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending && <Loader2 size={13} className="animate-spin" />} Save names
          </Button>
        </DialogFormFooter>
      </DialogFormContent>
    </Dialog>
  );
}
