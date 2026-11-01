'use client';

import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { todayIst } from '@/lib/dates';
import { formatInvoiceDate } from '@/lib/gst';
import { downloadPdf } from '@/components/print/pdf-download-button';
import { pdfFileName } from '@/components/print/format';

type PeriodId = 'this-month' | 'last-month' | 'this-fy' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar bounds for each preset, from today's IST date. "This FY" is
 * the Indian financial year (April–March) so far. */
function presetRange(id: Exclude<PeriodId, 'custom'>, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  if (id === 'this-month') return { from: `${y}-${pad(m)}-01`, to: today };
  if (id === 'last-month') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay)}` };
  }
  const fyStart = m >= 4 ? y : y - 1;
  return { from: `${fyStart}-04-01`, to: today };
}

const PRESETS: { id: Exclude<PeriodId, 'custom'>; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-fy', label: 'This financial year' },
];

/** "Statement" button for a customer — opens a small dialog to pick the
 * period (this month, last month, this financial year, or custom dates)
 * and downloads that customer's statement of account as a PDF
 * (/api/pdf/statements/[customerId]?from&to): opening balance, invoices,
 * payments and credit notes with a running balance, closing balance. */
export function StatementButton({
  customerId,
  name,
  variant = 'outline',
  size = 'sm',
  className,
}: {
  customerId: string;
  /** The customer's display name — used in the dialog title and file name. */
  name: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodId>('this-month');
  // Read when the dialog opens (not at render), so a page left open past
  // midnight still offers the right "this month".
  const [today, setToday] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [pending, setPending] = useState(false);

  function openDialog() {
    const t = todayIst();
    setToday(t);
    setPeriod('this-month');
    setCustomFrom(presetRange('this-fy', t).from);
    setCustomTo(t);
    setOpen(true);
  }

  const range = period === 'custom' ? { from: customFrom, to: customTo } : today ? presetRange(period, today) : { from: '', to: '' };
  const invalid = !range.from || !range.to || range.from > range.to;

  async function download() {
    if (invalid) {
      toast.error(range.from > range.to ? 'The start date is after the end date.' : 'Pick both dates.');
      return;
    }
    setPending(true);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      const file = pdfFileName(`Statement-${name.trim().replace(/\s+/g, '-')}-${range.from}-to-${range.to}`).replace(/-{2,}/g, '-');
      await downloadPdf(`/api/pdf/statements/${encodeURIComponent(customerId)}?${qs}`, file);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not prepare the statement');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={openDialog}>
        <FileText size={13} /> Statement
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <FileText size={16} className="flex-shrink-0 text-brand" /> <span className="min-w-0 truncate">Statement · {name}</span>
            </DialogTitle>
            <DialogDescription>Invoices, payments and credit notes for the period, with the balance after each one.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5" role="radiogroup" aria-label="Statement period">
            {PRESETS.map((p) => {
              const r = today ? presetRange(p.id, today) : null;
              return (
                <PeriodOption key={p.id} selected={period === p.id} onSelect={() => setPeriod(p.id)} label={p.label}>
                  {r && `${formatInvoiceDate(r.from)} – ${formatInvoiceDate(r.to)}`}
                </PeriodOption>
              );
            })}
            <PeriodOption selected={period === 'custom'} onSelect={() => setPeriod('custom')} label="Custom dates" />
            {period === 'custom' && (
              <div className="grid grid-cols-2 gap-2 px-1 pt-1">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-ink-faint">From</span>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo || undefined}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 w-full rounded-sm2 border border-line bg-surface px-2 font-mono text-[12.5px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-ink-faint">To</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 w-full rounded-sm2 border border-line bg-surface px-2 font-mono text-[12.5px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={download} disabled={pending || invalid}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {pending ? 'Preparing…' : 'Download PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PeriodOption({ selected, onSelect, label, children }: { selected: boolean; onSelect: () => void; label: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-center justify-between gap-3 rounded-sm2 border px-3 py-2.5 text-left transition-colors',
        selected ? 'border-brand bg-brand-light' : 'border-line hover:bg-surface-alt'
      )}
    >
      <span className={cn('text-[13px] font-bold', selected ? 'text-brand-dark' : 'text-ink')}>{label}</span>
      {children && <span className="font-mono text-[11.5px] text-ink-soft">{children}</span>}
    </button>
  );
}
