'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileMinus, Info, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { fmtInr, formatInvoiceDate, formatUnit } from '@/lib/gst';
import { useCreateCreditNote } from '@/hooks/use-credit-notes';
import { fmtQty, fmtQtyUnit } from '@/components/print/format';
import type { CreditNoteSource, CreditNoteSourceLine } from '@/actions/credit-notes';
import { CREDIT_REASONS, computeCreditNoteTotals, lineNet, round2, type CreditReasonId } from './credit-note-math';

type LineInputs = { qty: string; rate: string; discount: string };

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Raise a credit note against one invoice: pick a reason, enter how much
 * of each line to credit (never more than is still open on that line),
 * adjust the rate for a price correction, and see the GST-correct total —
 * at the invoice's own rates and bill discount — before saving. The same
 * math (credit-note-math.ts) runs again on the server when it saves. */
export function CreditNoteForm({ source, today }: { source: CreditNoteSource; today: string }) {
  const router = useRouter();
  const create = useCreateCreditNote();
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState<CreditReasonId>('RETURN');
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [inputs, setInputs] = useState<Record<string, LineInputs>>(() =>
    Object.fromEntries(source.lines.map((l) => [l.lineId, { qty: '', rate: String(l.rate), discount: String(l.discount || 0) }]))
  );

  const rows = useMemo(
    () =>
      source.lines.map((line) => {
        const v = inputs[line.lineId];
        const qty = num(v.qty);
        const rate = num(v.rate);
        const discount = num(v.discount);
        const errors = {
          qty: qty < 0 ? "Can't be negative" : qty > line.remaining + 1e-6 ? `Only ${fmtQty(line.remaining)} left` : null,
          rate: rate < 0 ? "Can't be negative" : rate > line.rate + 0.005 ? `Max ${fmtInr(line.rate)}` : null,
          discount: discount < 0 || discount > 100 ? '0 to 100' : null,
        };
        return { line, qty, rate, discount, errors, amount: lineNet({ qty, rate, discount }) };
      }),
    [source.lines, inputs]
  );
  const chosen = rows.filter((r) => r.qty > 0);
  const hasErrors = rows.some((r) => r.errors.qty || r.errors.rate || r.errors.discount);
  const totals = computeCreditNoteTotals(chosen, source.billFactor, source.rates);
  const applied = round2(Math.min(totals.total, source.balanceDue));
  const refundDue = round2(totals.total - applied);
  const anyOpen = source.lines.some((l) => l.remaining > 0);
  const billDiscountPct = Math.round((1 - source.billFactor) * 1000) / 10;

  function setLine(lineId: string, patch: Partial<LineInputs>) {
    setInputs((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));
  }

  function pickReason(id: CreditReasonId) {
    setReason(id);
    // Each reason starts from its own sensible stock default; "Other"
    // leaves whatever was chosen alone.
    const r = CREDIT_REASONS.find((x) => x.id === id);
    if (r && id !== 'OTHER') setRestock(r.restock);
  }

  function creditAll() {
    setInputs((prev) => {
      const next = { ...prev };
      for (const l of source.lines) if (l.remaining > 0) next[l.lineId] = { ...next[l.lineId], qty: String(l.remaining) };
      return next;
    });
  }

  function clearAll() {
    setInputs((prev) => Object.fromEntries(Object.entries(prev).map(([id, v]) => [id, { ...v, qty: '' }])));
  }

  async function submit() {
    if (!chosen.length) return toast.error('Enter a quantity to credit on at least one line.');
    if (hasErrors) return toast.error('Fix the highlighted figures first.');
    if (reason === 'OTHER' && !note.trim()) return toast.error('Add a short note saying what this credit is for.');
    try {
      const res = await create.mutateAsync({
        invoiceId: source.id,
        date,
        reason,
        note: note.trim() || null,
        restock,
        lines: chosen.map((r) => ({ lineId: r.line.lineId, qty: r.qty, rate: r.rate, discount: r.discount })),
      });
      const due = res.refundDue ?? 0;
      toast.success(`Credit note ${res.number} saved`, {
        description: due > 0.004 ? `Refund due ${fmtInr(due)} to the customer.` : `${fmtInr(res.applied ?? 0)} set off against ${source.number}.`,
      });
      router.push(`/credit-notes/${res.creditNoteId}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save the credit note');
    }
  }

  const customerName = source.customer.shopName || source.customer.name;

  return (
    <div>
      <Link href="/credit-notes" className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-faint hover:text-ink">
        <ArrowLeft size={13} /> Credit notes
      </Link>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
          <FileMinus size={18} className="text-brand" /> New credit note
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">
          Against{' '}
          <Link href={`/invoices/${source.id}`} className="font-mono text-ink-body underline-offset-2 hover:text-brand hover:underline">
            {source.number}
          </Link>{' '}
          · {customerName} · {formatInvoiceDate(source.date)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
            <span className="text-[12px] font-extrabold text-ink">What&apos;s being credited</span>
            {anyOpen && (
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
                  Clear
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={creditAll}>
                  Credit everything left
                </Button>
              </div>
            )}
          </div>

          {reason === 'RATE' && (
            <p className="flex gap-2 border-b border-line bg-surface-alt px-3.5 py-2.5 text-[12px] text-ink-body">
              <Info size={14} className="mt-px flex-shrink-0 text-ink-soft" />
              <span>
                Enter the quantity the correction applies to, and the <b className="text-ink">difference per unit</b> as the rate — billed ₹100, should have been ₹90 → rate 10.
              </span>
            </p>
          )}

          <div className="hidden grid-cols-[minmax(0,1fr)_96px_96px_72px_100px] gap-2 border-b border-line bg-surface-alt px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint md:grid">
            <span>Product</span>
            <span>Qty to credit</span>
            <span>Rate (₹)</span>
            <span>Disc %</span>
            <span className="text-right">Amount</span>
          </div>

          <div className="divide-y divide-line">
            {rows.map((r) => (
              <LineRow key={r.line.lineId} row={r} inputs={inputs[r.line.lineId]} onChange={(patch) => setLine(r.line.lineId, patch)} />
            ))}
          </div>

          {billDiscountPct > 0 && (
            <p className="border-t border-line px-3.5 py-2.5 text-[11.5px] text-ink-faint">
              {source.number} had a {billDiscountPct}% bill discount, so the credit is reduced by the same share before GST.
            </p>
          )}
        </section>

        <aside className="space-y-3 rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
          <div className="grid grid-cols-3 gap-2 rounded-lg2 bg-surface-alt p-2.5 text-[11px]">
            <InvoiceFigure label="Invoice total" value={fmtInr(source.total)} />
            <InvoiceFigure label="Received" value={fmtInr(source.amountPaid)} />
            <InvoiceFigure label="Balance due" value={fmtInr(source.balanceDue)} />
            {source.earlierCreditNotes.length > 0 && (
              <p className="col-span-3 text-ink-soft">Earlier credit notes: {source.earlierCreditNotes.join(', ')}</p>
            )}
          </div>

          <Field label="Credit note date" name="cn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

          <div>
            <span className="mb-1 block text-[11px] font-bold text-ink-faint">Reason</span>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Reason">
              {CREDIT_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={reason === r.id}
                  onClick={() => pickReason(r.id)}
                  className={cn(
                    'rounded-sm2 border px-2.5 py-2 text-left text-[12px] font-bold leading-snug transition-colors',
                    reason === r.id ? 'border-brand bg-brand-light text-brand-dark' : 'border-line text-ink-soft hover:bg-surface-alt hover:text-ink'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <Field
            label={reason === 'OTHER' ? 'What is this credit for?' : 'Note (optional)'}
            name="cn-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={reason === 'RETURN' ? 'e.g. 2 boxes returned unopened' : reason === 'DAMAGED' ? 'e.g. melted in transit' : ''}
          />

          <label className="flex cursor-pointer items-start gap-3 rounded-lg2 border border-line p-2.5">
            <PackageCheck size={16} className="mt-0.5 flex-shrink-0 text-ink-soft" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-bold text-ink">Put items back in stock</span>
              <span className="block text-[11.5px] text-ink-soft">
                {restock ? 'Credited quantities are added back to stock for products you track.' : 'Stock stays as it is — e.g. damaged goods that can’t be sold again.'}
              </span>
            </span>
            <Switch checked={restock} onChange={(e) => setRestock(e.target.checked)} aria-label="Put items back in stock" />
          </label>

          <div className="space-y-1 border-t border-line pt-3 text-[12.5px] text-ink-soft">
            <SumRow label="Gross amount" value={totals.gross} />
            {totals.itemDiscount > 0.004 && <SumRow label="Item discount" value={-totals.itemDiscount} />}
            {totals.billDiscount > 0.004 && <SumRow label="Bill discount" value={-totals.billDiscount} />}
            <SumRow label="Taxable value" value={totals.taxable} />
            {source.rates.interState ? (
              source.rates.igstRate > 0 && <SumRow label={`IGST ${fmtQty(source.rates.igstRate)}%`} value={totals.igst} />
            ) : (
              <>
                {source.rates.cgstRate > 0 && <SumRow label={`CGST ${fmtQty(source.rates.cgstRate)}%`} value={totals.cgst} />}
                {source.rates.sgstRate > 0 && <SumRow label={`SGST ${fmtQty(source.rates.sgstRate)}%`} value={totals.sgst} />}
              </>
            )}
            {Math.abs(totals.roundOff) > 0.004 && <SumRow label="Round off" value={totals.roundOff} />}
            <div className="flex justify-between gap-3 border-t border-line pt-1.5 text-[14px] font-bold text-ink">
              <span>Total credit</span>
              <span className="font-mono">{fmtInr(totals.total)}</span>
            </div>
          </div>

          {totals.total > 0 && (
            <div className={cn('rounded-lg2 px-3 py-2.5 text-[12px] text-ink-body', refundDue > 0.004 ? 'bg-gold-soft' : 'bg-green-soft')}>
              {applied > 0.004 && (
                <div>
                  <b className="font-mono text-ink">{fmtInr(applied)}</b> comes off {source.number}
                  {applied >= source.balanceDue - 0.004 ? ', settling it in full.' : '.'}
                </div>
              )}
              {refundDue > 0.004 && (
                <div className={applied > 0.004 ? 'mt-1' : ''}>
                  Refund due <b className="font-mono text-ink">{fmtInr(refundDue)}</b> to the customer.
                </div>
              )}
            </div>
          )}

          <Button type="button" className="w-full" onClick={submit} disabled={create.isPending || !anyOpen}>
            {create.isPending ? 'Saving…' : 'Save credit note'}
          </Button>
          {!anyOpen && <p className="text-center text-[11.5px] text-ink-faint">Every line on {source.number} has already been credited.</p>}
        </aside>
      </div>
    </div>
  );
}

function LineRow({
  row,
  inputs,
  onChange,
}: {
  row: { line: CreditNoteSourceLine; amount: number; errors: { qty: string | null; rate: string | null; discount: string | null } };
  inputs: LineInputs;
  onChange: (patch: Partial<LineInputs>) => void;
}) {
  const { line, amount, errors } = row;
  const done = line.remaining <= 0;
  return (
    <div className={cn('grid grid-cols-3 gap-2 px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_96px_96px_72px_100px] md:items-start', done && 'opacity-60')}>
      <div className="col-span-3 min-w-0 md:col-span-1 md:pt-1">
        <div className="text-[13px] font-bold text-ink">{line.name}</div>
        <div className="text-[11.5px] text-ink-faint">
          Invoiced {fmtQtyUnit(line.qty, line.unit)} at {fmtInr(line.rate)}
          {line.discount > 0 && ` · ${fmtQty(line.discount)}% off`}
          {line.credited > 0 && ` · ${fmtQty(line.credited)} already credited`}
        </div>
      </div>
      {done ? (
        <div className="col-span-3 text-[12px] font-bold text-ink-faint md:col-span-4 md:pt-1 md:text-right">Fully credited</div>
      ) : (
        <>
          <NumCell label={`Qty (${formatUnit(line.unit)})`} value={inputs.qty} placeholder="0" error={errors.qty} hint={`of ${fmtQty(line.remaining)}`} onChange={(qty) => onChange({ qty })} />
          <NumCell label="Rate (₹)" value={inputs.rate} error={errors.rate} onChange={(rate) => onChange({ rate })} />
          <NumCell label="Disc %" value={inputs.discount} error={errors.discount} onChange={(discount) => onChange({ discount })} />
          <div className="col-span-3 flex items-baseline justify-between md:col-span-1 md:block md:pt-1.5 md:text-right">
            <span className="text-[11px] font-bold text-ink-faint md:hidden">Amount</span>
            <span className={cn('font-mono text-[13px] font-bold', amount > 0 ? 'text-ink' : 'text-ink-faint')}>{fmtInr(amount)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function NumCell({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-bold text-ink-faint md:sr-only">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-8 w-full rounded-sm2 border bg-surface px-2 text-right font-mono text-[12.5px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20',
          error ? 'border-red focus:border-red' : 'border-line'
        )}
      />
      {error ? <span className="mt-0.5 block text-[10.5px] font-semibold text-red">{error}</span> : hint && <span className="mt-0.5 block text-[10.5px] text-ink-faint">{hint}</span>}
    </label>
  );
}

function InvoiceFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block font-bold text-ink-faint">{label}</span>
      <span className="block truncate font-mono text-[12.5px] font-bold text-ink">{value}</span>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="font-mono text-ink-body">{value < 0 ? `−${fmtInr(-value)}` : fmtInr(value)}</span>
    </div>
  );
}
