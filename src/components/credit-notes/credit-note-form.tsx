'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileMinus, Info, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { fmtInr, formatInvoiceDate, formatUnit } from '@/lib/gst';
import { useCreateCreditNote } from '@/hooks/use-credit-notes';
import { fmtQty, fmtQtyUnit } from '@/components/print/format';
import type { CreditNoteSource, CreditNoteSourceLine } from '@/actions/credit-notes';
import { CREDIT_PCTS, CREDIT_REASONS, computeCreditNoteTotals, lineNet, round2, type CreditReasonId } from './credit-note-math';

/** One returned row. An invoice line starts with one; "Add a damaged part"
 * gives it a second, so part of a line can go back to stock and the rest
 * not, each at its own credit %. */
type Row = { key: string; lineId: string; qty: string; rate: string; discount: string; creditPct: number; restock: boolean; extra: boolean };

const REFUND_MODES = ['Cash', 'UPI', 'GPay', 'Bank transfer', 'Cheque'];

let keySeq = 0;
const nextKey = () => `r${++keySeq}`;

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Return goods (or correct a price) against one invoice: for each line,
 * how much came back, whether it's fit to sell again (back to stock) or
 * not, and how much of its value to credit — less for used or damaged
 * goods. A deduction (handling, damage) comes off before GST. When the
 * invoice is already paid, the rest is refunded now or kept as the
 * customer's credit. The same math (credit-note-math.ts) runs again on the
 * server when it saves. */
export function CreditNoteForm({ source, today }: { source: CreditNoteSource; today: string }) {
  const router = useRouter();
  const create = useCreateCreditNote();
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState<CreditReasonId>('RETURN');
  const [note, setNote] = useState('');
  const [deduction, setDeduction] = useState('');
  const [deductionReason, setDeductionReason] = useState('Handling charges');
  const [settle, setSettle] = useState<'refund' | 'credit'>('refund');
  const [refundMode, setRefundMode] = useState('Cash');
  const [refundRef, setRefundRef] = useState('');
  const [rows, setRows] = useState<Row[]>(() =>
    source.lines.map((l) => ({ key: nextKey(), lineId: l.lineId, qty: '', rate: String(l.rate), discount: String(l.discount || 0), creditPct: 100, restock: true, extra: false }))
  );

  const lineById = useMemo(() => new Map(source.lines.map((l) => [l.lineId, l])), [source.lines]);
  const isRate = reason === 'RATE';

  const computed = useMemo(
    () =>
      rows.map((r) => {
        const line = lineById.get(r.lineId)!;
        const qty = num(r.qty);
        const rate = num(r.rate);
        const discount = num(r.discount);
        return { row: r, line, qty, rate, discount, creditPct: r.creditPct, restock: !isRate && r.restock, amount: lineNet({ qty, rate, discount, creditPct: r.creditPct }) };
      }),
    [rows, lineById, isRate]
  );
  // A line's rows together can't return more than is still open on it.
  const usedByLine = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of computed) m.set(c.line.lineId, (m.get(c.line.lineId) ?? 0) + c.qty);
    return m;
  }, [computed]);
  const errorFor = (c: (typeof computed)[number]) => {
    if (c.qty < 0) return "Can't be negative";
    if ((usedByLine.get(c.line.lineId) ?? 0) > c.line.remaining + 1e-6) return `Only ${fmtQty(c.line.remaining)} open`;
    if (c.rate < 0 || c.rate > c.line.rate + 0.005) return `Rate up to ${fmtInr(c.line.rate)}`;
    return null;
  };
  const chosen = computed.filter((c) => c.qty > 0);
  const hasErrors = computed.some((c) => errorFor(c));
  const before = computeCreditNoteTotals(chosen, source.billFactor, source.rates);
  const deductionValue = Math.max(0, num(deduction));
  const deductionTooBig = deductionValue > before.taxable + 0.004;
  const totals = computeCreditNoteTotals(chosen, source.billFactor, source.rates, deductionTooBig ? 0 : deductionValue);
  const applied = round2(Math.min(totals.total, source.balanceDue));
  const refundDue = round2(totals.total - applied);
  const anyOpen = source.lines.some((l) => l.remaining > 0);
  const billDiscountPct = Math.round((1 - source.billFactor) * 1000) / 10;

  // "+1 Box back to stock · 2 Box not sellable", per unit.
  const stockSummary = useMemo(() => {
    const sum = (restock: boolean) => {
      const byUnit = new Map<string, number>();
      for (const c of chosen) if (c.restock === restock && c.line.productId) byUnit.set(formatUnit(c.line.unit), (byUnit.get(formatUnit(c.line.unit)) ?? 0) + c.qty);
      return [...byUnit].map(([u, q]) => `${fmtQty(q)} ${u}`).join(' + ');
    };
    return { back: sum(true), out: sum(false) };
  }, [chosen]);

  function setRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addDamagedPart(line: CreditNoteSourceLine) {
    setRows((prev) => {
      const at = prev.map((r) => r.lineId).lastIndexOf(line.lineId);
      const row: Row = { key: nextKey(), lineId: line.lineId, qty: '', rate: String(line.rate), discount: String(line.discount || 0), creditPct: 100, restock: false, extra: true };
      return [...prev.slice(0, at + 1), row, ...prev.slice(at + 1)];
    });
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function pickReason(id: CreditReasonId) {
    setReason(id);
    // Each reason starts its rows from its own sensible stock default;
    // "Other" leaves whatever was chosen alone.
    const r = CREDIT_REASONS.find((x) => x.id === id);
    if (r && id !== 'OTHER') setRows((prev) => prev.map((row) => (row.extra ? row : { ...row, restock: r.restock })));
  }

  function returnEverything() {
    setRows(source.lines.map((l) => ({ key: nextKey(), lineId: l.lineId, qty: l.remaining > 0 ? String(l.remaining) : '', rate: String(l.rate), discount: String(l.discount || 0), creditPct: 100, restock: !isRate && reason !== 'DAMAGED', extra: false })));
  }

  async function submit() {
    if (!chosen.length) return toast.error('Enter how much came back on at least one line.');
    if (hasErrors) return toast.error('Fix the highlighted figures first.');
    if (deductionTooBig) return toast.error(`The deduction can't be more than ${fmtInr(before.taxable)}.`);
    if (reason === 'OTHER' && !note.trim()) return toast.error('Add a short note saying what this credit is for.');
    try {
      const res = await create.mutateAsync({
        invoiceId: source.id,
        date,
        reason,
        note: note.trim() || null,
        lines: chosen.map((c) => ({ lineId: c.line.lineId, qty: c.qty, rate: c.rate, discount: c.discount, creditPct: c.creditPct, restock: c.restock })),
        deduction: deductionValue,
        deductionReason: deductionValue > 0 ? deductionReason.trim() || 'Deduction' : null,
        refundNow: refundDue > 0.004 && settle === 'refund' ? { mode: refundMode, reference: refundRef.trim() || null } : null,
      });
      toast.success(`Credit note ${res.number} saved`, {
        description:
          (res.refunded ?? 0) > 0.004
            ? `${fmtInr(res.refunded!)} refunded by ${refundMode}.`
            : (res.refundDue ?? 0) > 0.004
              ? `${fmtInr(res.refundDue!)} kept as ${customerName}'s credit.`
              : `${fmtInr(res.applied ?? 0)} set off against ${source.number}.`,
      });
      router.push(`/credit-notes/${res.creditNoteId}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save the credit note');
    }
  }

  const customerName = source.customer.shopName || source.customer.name;
  const paidInFull = source.balanceDue <= 0.004;

  return (
    <div>
      <Link href="/credit-notes" className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-faint hover:text-ink">
        <ArrowLeft size={13} /> Credit notes
      </Link>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
          <FileMinus size={18} className="text-brand" /> {isRate ? 'Price correction' : 'Return goods'}
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">
          Against{' '}
          <Link href={`/invoices/${source.id}`} className="font-mono text-ink-body underline-offset-2 hover:text-brand hover:underline">
            {source.number}
          </Link>{' '}
          · {customerName} · {formatInvoiceDate(source.date)} · {paidInFull ? <b className="text-green">Paid</b> : `${fmtInr(source.balanceDue)} due`} of {fmtInr(source.total)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section className="min-w-0 overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
            <span className="text-[13px] font-extrabold text-ink">{isRate ? 'What the correction applies to' : 'What came back'}</span>
            {anyOpen && (
              <Button type="button" size="sm" variant="outline" onClick={returnEverything}>
                {isRate ? 'All open quantities' : 'Return everything'}
              </Button>
            )}
          </div>

          {isRate && (
            <p className="flex gap-2 border-b border-line bg-surface-alt px-3.5 py-2.5 text-[12px] text-ink-body">
              <Info size={14} className="mt-px flex-shrink-0 text-ink-soft" />
              <span>
                Enter the quantity the correction applies to, and the <b className="text-ink">difference per unit</b> as the rate — billed ₹100, should have been ₹90 → rate 10.
              </span>
            </p>
          )}

          <div className="divide-y divide-line">
            {source.lines.map((line) => {
              const lineRows = computed.filter((c) => c.line.lineId === line.lineId);
              const done = line.remaining <= 0;
              return (
                <div key={line.lineId} className={cn('px-3.5 py-3', done && 'opacity-60')}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <div className="text-[13px] font-bold text-ink">{line.name}</div>
                    {done && <span className="text-[11.5px] font-bold text-ink-faint">Fully credited</span>}
                  </div>
                  <div className="text-[11.5px] text-ink-faint">
                    Invoiced {fmtQtyUnit(line.qty, line.unit)} at {fmtInr(line.rate)}
                    {line.discount > 0 && ` · ${fmtQty(line.discount)}% off`}
                    {!done && ` · ${fmtQty(line.remaining)} open`}
                    {line.credited > 0 && ` · ${fmtQty(line.credited)} already credited`}
                  </div>
                  {!done && (
                    <div className="mt-2 space-y-2">
                      {lineRows.map((c) => {
                        const error = errorFor(c);
                        return (
                          <div
                            key={c.row.key}
                            className={cn(
                              'grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg2 border p-2.5 md:grid-cols-[100px_minmax(0,1fr)_minmax(0,1.1fr)_96px] md:items-center md:gap-3',
                              c.qty > 0 && !isRate ? (c.restock ? 'border-line bg-green-soft' : 'border-line bg-gold-soft') : 'border-line'
                            )}
                          >
                            <label className="block min-w-0">
                              <span className="mb-0.5 block text-[10.5px] font-bold text-ink-faint">
                                {c.row.extra ? 'Damaged part' : isRate ? 'Qty' : 'Returned'} ({formatUnit(line.unit)})
                              </span>
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                value={c.row.qty}
                                placeholder="0"
                                aria-invalid={!!error}
                                onChange={(e) => setRow(c.row.key, { qty: e.target.value })}
                                className={cn(
                                  'h-9 w-full rounded-sm2 border bg-surface px-2 text-right font-mono text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
                                  error ? 'border-red' : 'border-line'
                                )}
                              />
                              {error && <span className="mt-0.5 block text-[10.5px] font-semibold text-red">{error}</span>}
                            </label>

                            <div className="order-first col-span-2 flex items-start justify-between md:order-none md:col-span-1 md:block">
                              {isRate ? (
                                <label className="block">
                                  <span className="mb-0.5 block text-[10.5px] font-bold text-ink-faint">Rate difference (₹)</span>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="any"
                                    value={c.row.rate}
                                    onChange={(e) => setRow(c.row.key, { rate: e.target.value })}
                                    className="h-9 w-full rounded-sm2 border border-line bg-surface px-2 text-right font-mono text-[13px] text-ink outline-none focus:border-primary"
                                  />
                                </label>
                              ) : (
                                <div className="w-full">
                                  <span className="mb-0.5 block text-[10.5px] font-bold text-ink-faint">Condition</span>
                                  <div className="grid grid-cols-2 overflow-hidden rounded-sm2 border border-line" role="group" aria-label="Condition">
                                    <button
                                      type="button"
                                      aria-pressed={c.row.restock}
                                      onClick={() => setRow(c.row.key, { restock: true })}
                                      className={cn('h-9 text-[12px] font-bold', c.row.restock ? 'bg-green-soft text-green' : 'bg-surface text-ink-soft hover:bg-surface-alt')}
                                    >
                                      Back to stock
                                    </button>
                                    <button
                                      type="button"
                                      aria-pressed={!c.row.restock}
                                      onClick={() => setRow(c.row.key, { restock: false })}
                                      className={cn('h-9 border-l border-line text-[12px] font-bold', !c.row.restock ? 'bg-gold-soft text-ink' : 'bg-surface text-ink-soft hover:bg-surface-alt')}
                                    >
                                      Not sellable
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="col-span-2 md:col-span-1">
                              <span className="mb-0.5 block text-[10.5px] font-bold text-ink-faint">Credit</span>
                              <div className="flex gap-1">
                                {CREDIT_PCTS.map((p) => (
                                  <button
                                    key={p}
                                    type="button"
                                    aria-pressed={c.row.creditPct === p}
                                    onClick={() => setRow(c.row.key, { creditPct: p })}
                                    className={cn(
                                      'h-9 flex-1 rounded-sm2 border text-[12px] font-bold',
                                      c.row.creditPct === p ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft hover:border-brand'
                                    )}
                                  >
                                    {p}%
                                  </button>
                                ))}
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  max={100}
                                  aria-label="Credit percent"
                                  value={CREDIT_PCTS.includes(c.row.creditPct as (typeof CREDIT_PCTS)[number]) ? '' : c.row.creditPct}
                                  placeholder="%"
                                  onChange={(e) => setRow(c.row.key, { creditPct: Math.min(100, Math.max(0, num(e.target.value))) })}
                                  className="h-9 w-12 rounded-sm2 border border-line bg-surface px-1 text-center font-mono text-[12px] outline-none focus:border-primary"
                                />
                              </div>
                            </div>

                            <div className="flex items-end justify-end gap-2 md:flex-col md:items-end md:justify-center md:gap-0.5">
                              <span className={cn('font-mono text-[13.5px] font-bold', c.amount > 0 ? 'text-ink' : 'text-ink-faint')}>{fmtInr(c.amount)}</span>
                              {c.row.extra && (
                                <button type="button" onClick={() => removeRow(c.row.key)} className="flex items-center gap-0.5 text-[11px] font-bold text-red hover:underline">
                                  <X size={11} /> Remove
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {!isRate && lineRows.length < 2 && (
                        <button type="button" onClick={() => addDamagedPart(line)} className="flex items-center gap-1 text-[12px] font-bold text-brand hover:underline">
                          <Plus size={12} /> Add a damaged part
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!isRate && (stockSummary.back || stockSummary.out) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-surface-alt px-3.5 py-2.5 text-[12px]">
              {stockSummary.back && (
                <span className="text-green">
                  <b>+{stockSummary.back}</b> back to stock
                </span>
              )}
              {stockSummary.out && (
                <span className="text-ink-soft">
                  <b className="text-ink">{stockSummary.out}</b> not sellable — stays out of stock
                </span>
              )}
            </div>
          )}

          {billDiscountPct > 0 && (
            <p className="border-t border-line px-3.5 py-2.5 text-[11.5px] text-ink-faint">
              {source.number} had a {billDiscountPct}% bill discount, so the credit is reduced by the same share before GST.
            </p>
          )}
        </section>

        <aside className="space-y-3 rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
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
            placeholder={reason === 'RETURN' ? 'e.g. 1 melted in transit, 1 box opened' : reason === 'DAMAGED' ? 'e.g. melted in transit' : ''}
          />

          <div>
            <span className="mb-1 block text-[11px] font-bold text-ink-faint">Deduction before GST (optional)</span>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                aria-label="Deduction amount"
                placeholder="₹0"
                value={deduction}
                onChange={(e) => setDeduction(e.target.value)}
                className={cn(
                  'h-9 rounded-sm2 border bg-surface px-2 text-right font-mono text-[13px] outline-none focus:border-primary',
                  deductionTooBig ? 'border-red' : 'border-line'
                )}
              />
              <input
                aria-label="Deduction reason"
                value={deductionReason}
                onChange={(e) => setDeductionReason(e.target.value)}
                className="h-9 rounded-sm2 border border-line bg-surface px-2 text-[13px] outline-none focus:border-primary"
              />
            </div>
            {deductionTooBig && <span className="mt-0.5 block text-[10.5px] font-semibold text-red">Up to {fmtInr(before.taxable)}</span>}
          </div>

          <div className="space-y-1 border-t border-line pt-3 text-[12.5px] text-ink-soft">
            <SumRow label="Gross amount" value={totals.gross} />
            {totals.itemDiscount > 0.004 && <SumRow label="Item discount" value={-totals.itemDiscount} />}
            {totals.partialCredit > 0.004 && <SumRow label="Less: part credit (used/damaged)" value={-totals.partialCredit} />}
            {totals.billDiscount > 0.004 && <SumRow label="Bill discount" value={-totals.billDiscount} />}
            {totals.deduction > 0.004 && <SumRow label={deductionReason.trim() || 'Deduction'} value={-totals.deduction} />}
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
            <div className={cn('space-y-2.5 rounded-lg2 px-3 py-2.5 text-[12px] text-ink-body', refundDue > 0.004 ? 'border border-gold bg-gold-soft' : 'bg-green-soft')}>
              {applied > 0.004 && (
                <div>
                  <b className="font-mono text-ink">{fmtInr(applied)}</b> comes off {source.number}
                  {applied >= source.balanceDue - 0.004 ? ', settling it in full.' : '.'}
                </div>
              )}
              {refundDue > 0.004 && (
                <>
                  <div className="text-[13px] font-extrabold text-ink">
                    {applied > 0.004 ? 'The rest' : 'Invoice already paid'} — {fmtInr(refundDue)} to give back
                  </div>
                  <label className="flex items-center gap-2 font-bold text-ink">
                    <input type="radio" name="settle" checked={settle === 'refund'} onChange={() => setSettle('refund')} className="h-4 w-4 accent-[hsl(var(--brand))]" />
                    Refund now
                  </label>
                  {settle === 'refund' && (
                    <div className="space-y-1.5 pl-6">
                      <div className="grid grid-cols-3 gap-1">
                        {REFUND_MODES.map((m) => (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={refundMode === m}
                            onClick={() => setRefundMode(m)}
                            className={cn(
                              'h-8 rounded-sm2 border text-[11.5px] font-bold',
                              refundMode === m ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft'
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <input
                        aria-label="Refund reference"
                        value={refundRef}
                        onChange={(e) => setRefundRef(e.target.value)}
                        placeholder={refundMode === 'Cash' ? 'Note (optional)' : 'Reference (optional)'}
                        className="h-8 w-full rounded-sm2 border border-line bg-surface px-2 text-[12px] outline-none focus:border-primary"
                      />
                    </div>
                  )}
                  <label className="flex items-start gap-2">
                    <input type="radio" name="settle" checked={settle === 'credit'} onChange={() => setSettle('credit')} className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]" />
                    <span>
                      <b className="text-ink">Keep as credit</b> — adjust it on their next invoice, or refund later
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          <Button type="button" className="h-10 w-full" onClick={submit} disabled={create.isPending || !anyOpen}>
            {create.isPending ? 'Saving…' : refundDue > 0.004 && settle === 'refund' ? `Save & refund ${fmtInr(refundDue)}` : 'Save credit note'}
          </Button>
          {!anyOpen && <p className="text-center text-[11.5px] text-ink-faint">Every line on {source.number} has already been credited.</p>}
        </aside>
      </div>
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
