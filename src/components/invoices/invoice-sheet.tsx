'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import { computeTotals, fmtInr, formatInvoiceDate, formatUnit, type TotalsResult } from '@/lib/gst';
import { numberToWords } from '@/lib/number-to-words';
import { gstStateCode } from '@/lib/gst-state-codes';
import { computeCapacities, paginateLines, useMeasuredSections, USABLE_MM, USABLE_PX } from './print-pagination';

export type InvoiceSheetCompany = {
  name: string;
  address?: string | null;
  gstin?: string | null;
  state: string;
  bankName?: string | null;
  bankAcc?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  upi?: string | null;
  terms?: string | null;
  logoUrl?: string | null;
  cgstRate: string | number;
  sgstRate: string | number;
  igstRate: string | number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
  /** Per-company display currency for printed amounts — defaults to INR via fmtInr() when absent. */
  currency?: string;
  /** PDF section toggle from Company settings — undefined behaves as "off" (hidden). */
  pdfShowBankDetails?: boolean;
};

export type InvoiceSheetCustomer = {
  name: string;
  shopName?: string | null;
  address?: string | null;
  state: string;
  gstin?: string | null;
};

export type InvoiceSheetLine = {
  lineId: string;
  productId?: string | null;
  name: string;
  unit: string;
  qty: number;
  rate: number;
  discount: number;
  packQty?: number | null;
};

// ---------------------------------------------------------------------------
// Totals ladder — shared by every template (MODERN here, CLASSIC/CLEAN in
// invoice-sheet-classic.tsx) so they all tell the same discount story:
//
//   Sub total → Bill discount → Taxable value → CGST/SGST or IGST →
//   Round off → Total → "You saved ₹X"
//
// Item discounts aren't a row of their own: each line already prints its
// Disc% and its discounted Amount, so the ladder starts from the sum of
// those (the sub total), and only the bill discount — which no line shows —
// gets a step. computeTotals() stays the single source of truth: every row
// is read from the `totals` it produced, so the ladder always adds up to
// the printed Total. "You saved" still counts both kinds of discount.
// ---------------------------------------------------------------------------

const EPSILON = 0.005;

export type LadderRow = {
  key: string;
  label: string;
  /** Always ≥ 0 — `sign` says which way it moves the total. */
  amount: number;
  sign?: '−' | '+';
  /** Draw a rule above this row (the step from discounts to taxable). */
  rule?: boolean;
};

export type TotalsLadder = {
  /** Every row between the top of the ladder and the Total line. */
  rows: LadderRow[];
  total: number;
  gross: number;
  itemDiscount: number;
  billDiscount: number;
  /** Item + bill discount — the "You saved" line; 0 means don't show it. */
  saved: number;
};

function pct(n: number | string): string {
  return String(Number(n));
}

export function totalsLadder({
  lines,
  totals,
  discountType,
  discountValue,
  rates,
}: {
  lines: { qty: number; rate: number; discount: number }[];
  totals: TotalsResult;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  /** The invoice's own (snapshotted) rates — only used for row labels. */
  rates: { cgstRate: number | string; sgstRate: number | string; igstRate: number | string };
}): TotalsLadder {
  const gross = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const itemDiscount = Math.max(0, gross - totals.subtotal);
  const billDiscount = totals.overallDiscountAmount;
  const saved = itemDiscount + billDiscount >= EPSILON ? itemDiscount + billDiscount : 0;

  const rows: LadderRow[] = [];
  // Without a bill discount, sub total and taxable value are the same
  // number — one row.
  const hasBillDiscount = billDiscount >= EPSILON;
  if (hasBillDiscount) {
    const label = discountType === 'PERCENT' && discountValue ? `Bill discount (${pct(discountValue)}%)` : 'Bill discount';
    rows.push({ key: 'subtotal', label: 'Sub total', amount: totals.subtotal });
    rows.push({ key: 'bill-discount', label, amount: billDiscount, sign: '−' });
  }
  rows.push({ key: 'taxable', label: 'Taxable value', amount: totals.taxable, rule: hasBillDiscount });
  if (totals.useIgst) {
    if (totals.igst >= EPSILON) rows.push({ key: 'igst', label: `IGST ${pct(rates.igstRate)}%`, amount: totals.igst });
  } else {
    if (totals.cgst >= EPSILON) rows.push({ key: 'cgst', label: `CGST ${pct(rates.cgstRate)}%`, amount: totals.cgst });
    if (totals.sgst >= EPSILON) rows.push({ key: 'sgst', label: `SGST ${pct(rates.sgstRate)}%`, amount: totals.sgst });
  }
  if (Math.abs(totals.roundOff) >= EPSILON) {
    rows.push({ key: 'round-off', label: 'Round off', amount: Math.abs(totals.roundOff), sign: totals.roundOff > 0 ? '+' : '−' });
  }
  return { rows, total: totals.total, gross, itemDiscount, billDiscount, saved };
}

/** Line-level discount % input value, clamped to 0–100 as it's typed. */
export function clampDiscount(raw: string): number {
  const v = parseFloat(raw);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
}

// ---------------------------------------------------------------------------
// Print pagination — see print-pagination.tsx and invoice-sheet-classic.tsx
// (which this mirrors) for the full rationale. Line items are pre-split
// into explicit page-sized chunks in JS, sized from this invoice's actual
// measured section heights, with the header/buyer markup rendered fresh on
// every chunk instead of relying on the browser to repeat a <thead>.
//
// The non-editable (print/PDF) render below is never shown un-printed —
// the live builder preview always uses editable={true}, and every
// editable={false} usage exists purely to be printed or exported to PDF
// (see invoices/[id]/page.tsx and builder-client.tsx). So its styling here
// is unconditionally the "print" look (bordered table, black ink) rather
// than gated behind a `print:` media-query variant — keeping the DOM this
// component measures identical to the DOM that ultimately gets printed,
// with nothing that only changes at actual print time to fall out of sync
// with.
// ---------------------------------------------------------------------------

/** The items table's header row — shared between the real table and the
 * hidden measurement probe (see useMeasuredSections) so the probe measures
 * the exact markup that actually gets printed. */
function modernTheadRow({ editable, showDisc }: { editable: boolean; showDisc: boolean }) {
  if (editable) {
    return (
      <tr className="border-b-2 border-ink text-left text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        <th className="pb-1.5 pr-1.5">Item</th>
        <th className="pb-1.5 pr-1.5 text-right">Qty</th>
        <th className="pb-1.5 pr-1.5 text-right font-mono">Rate</th>
        <th className="pb-1.5 pr-1.5 text-right">Disc%</th>
        <th className="pb-1.5 pr-1.5 text-right font-mono">Amount</th>
        <th className="pb-1.5" />
      </tr>
    );
  }
  return (
    <tr className="border-b-2 border-ink bg-surface-alt text-left text-[10px] font-bold uppercase tracking-wide text-ink">
      <th className="border border-ink px-2 py-1.5">Item</th>
      <th className="border border-ink px-2 py-1.5 text-right">Qty</th>
      <th className="border border-ink px-2 py-1.5 text-right font-mono">Rate</th>
      {/* Printed whenever any line is discounted — without it, qty × rate
          visibly didn't equal the amount next to it. */}
      {showDisc && <th className="border border-ink px-2 py-1.5 text-right">Disc%</th>}
      <th className="border border-ink px-2 py-1.5 text-right font-mono">Amount</th>
    </tr>
  );
}

/** One item row's `<td>` cells — shared between the real table and the
 * measurement probe the same way modernTheadRow is. */
function modernRowCells(
  l: InvoiceSheetLine,
  ctx: {
    editable: boolean;
    showDisc: boolean;
    currency?: string;
    onUpdateLine?: (lineId: string, patch: Partial<InvoiceSheetLine>) => void;
    onIncrement?: (lineId: string) => void;
    onDecrement?: (lineId: string) => void;
    onRemoveLine?: (lineId: string) => void;
  }
) {
  const { editable, showDisc, currency, onUpdateLine, onIncrement, onDecrement, onRemoveLine } = ctx;
  const lineTaxable = l.qty * l.rate * (1 - l.discount / 100);
  const packQty = l.packQty && Number(l.packQty) > 0 ? Number(l.packQty) : null;
  // Whole boxes + leftover loose pieces implied by a fractional qty (e.g.
  // 1.5 boxes of 40 = 1 box + 20 pieces) — qty itself stays the single
  // source of truth; this is just its display.
  const boxes = packQty ? Math.floor(l.qty + 1e-9) : null;
  const extraPieces = packQty ? Math.round((l.qty - boxes!) * packQty) : null;
  const qtyHint = packQty ? (extraPieces! > 0 ? `${boxes} ${formatUnit(l.unit)}${boxes !== 1 ? 's' : ''} + ${extraPieces} pc` : `≈${packQty * l.qty} pcs`) : null;

  const cellCls = editable ? 'whitespace-nowrap py-2 pr-1.5' : 'whitespace-nowrap border border-ink px-2 py-1.5';

  return (
    <>
      <td className={cellCls}>
        <span className="inline-flex items-center gap-1.5">
          {l.name}
          {editable && !l.productId && (
            <span title="Not from your product catalog" className="rounded-sm2 bg-surface-alt px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-faint">
              Custom
            </span>
          )}
        </span>
        {editable && !l.discount && qtyHint && <div className="text-[10.5px] font-medium text-ink-faint">{qtyHint}</div>}
      </td>
      <td className={`${cellCls} text-right`}>
        {editable ? (
          <div className="flex flex-col items-end gap-0.5">
            <div className="inline-flex items-center gap-1 rounded-sm2 bg-bg p-0.5">
              <button onClick={() => onDecrement?.(l.lineId)} aria-label={`Decrease ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-sm2 border border-line bg-surface text-ink-soft hover:border-brand hover:text-brand">
                <Minus size={9} />
              </button>
              <span key={l.qty} className="min-w-[14px] animate-bump text-center font-mono text-[11.5px] font-bold">
                {l.qty}
              </span>
              <button onClick={() => onIncrement?.(l.lineId)} aria-label={`Increase ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-sm2 border border-line bg-surface text-ink-soft hover:border-brand hover:text-brand">
                <Plus size={9} />
              </button>
            </div>
            <span className="pr-0.5 text-[9.5px] font-semibold text-ink-faint">{formatUnit(l.unit)}</span>
          </div>
        ) : (
          <span className="font-mono">{packQty && extraPieces! > 0 ? `${boxes} ${formatUnit(l.unit)}${boxes !== 1 ? 's' : ''} + ${extraPieces} pc` : `${l.qty} ${formatUnit(l.unit)}`}</span>
        )}
      </td>
      <td className={`${cellCls} text-right`}>
        {editable ? (
          <input
            type="number"
            min={0}
            step="0.01"
            value={l.rate}
            onChange={(e) => onUpdateLine?.(l.lineId, { rate: parseFloat(e.target.value) || 0 })}
            className="w-[56px] rounded-sm2 border border-line bg-surface px-1.5 py-1 text-right font-mono text-[11.5px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
          />
        ) : (
          <span className="font-mono">{fmtInr(l.rate, currency)}</span>
        )}
      </td>
      {editable && (
        <td className="whitespace-nowrap py-2 pr-1.5 text-right">
          <input
            type="number"
            min={0}
            max={100}
            step="1"
            value={l.discount}
            onChange={(e) => onUpdateLine?.(l.lineId, { discount: clampDiscount(e.target.value) })}
            className="w-[42px] rounded-sm2 border border-line bg-surface px-1.5 py-1 text-right font-mono text-[11.5px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
          />
        </td>
      )}
      {!editable && showDisc && <td className={`${cellCls} text-right`}>{l.discount ? pct(l.discount) : ''}</td>}
      <td className={`${cellCls} text-right font-mono`}>{fmtInr(lineTaxable, currency)}</td>
      {editable && (
        <td className="whitespace-nowrap py-2">
          <button onClick={() => onRemoveLine?.(l.lineId)} aria-label={`Remove ${l.name}`} className="flex h-[22px] w-[22px] items-center justify-center rounded-sm2 text-ink-faint hover:bg-brand-light hover:text-brand-dark">
            <Trash2 size={12} />
          </button>
        </td>
      )}
    </>
  );
}

type SharedProps = Parameters<typeof InvoiceSheet>[0];

/** Letterhead: logo, company details, "Tax invoice" badge + invoice
 * No./Date — identical markup rendered fresh on every physical page. */
function ModernHeader({ company, date, due, invoiceNumber, editable }: SharedProps) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-5 ${editable ? '' : 'flex-none'}`}>
      <div className="flex items-start gap-3.5">
        {company.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt=""
            className="h-[52px] w-[52px] flex-shrink-0 rounded-sm2 border border-line object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <div>
          <div className="text-[18.5px] font-extrabold text-ink">{company.name}</div>
          {company.address && <div className="mt-1 max-w-[280px] whitespace-pre-line text-[12px] leading-relaxed text-ink-soft">{company.address}</div>}
          <div className="mt-1.5 font-mono text-[11px] text-ink-soft">
            GSTIN {company.gstin || '—'} &nbsp;·&nbsp; {company.state} ({gstStateCode(company.state)})
          </div>
        </div>
      </div>
      <div className={`rounded-lg2 border px-4 py-3 text-right ${editable ? 'border-line bg-bg' : 'border-ink bg-transparent'}`}>
        <div className={`text-[10.5px] font-extrabold uppercase tracking-[0.08em] ${editable ? 'text-brand' : 'text-ink'}`}>Tax invoice</div>
        {/* No number exists yet in the builder's live preview — the real
            one is only claimed from the sequential counter on Save (see
            createInvoice), so this never shows a workflow-status word like
            "Draft" on what could become a customer-facing PDF. */}
        <div className="mt-1 font-mono text-[18.5px] font-extrabold text-ink">{invoiceNumber ?? '—'}</div>
        <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">
          Dated <span className="font-mono font-semibold text-ink-body">{formatInvoiceDate(date)}</span>
        </div>
        <div className="text-[11.5px] leading-relaxed text-ink-soft">
          Due <span className="font-mono text-ink-body">{formatInvoiceDate(due)}</span>
        </div>
      </div>
    </div>
  );
}

/** "Bill to" block — same repeat-per-page treatment as the letterhead. */
function ModernBuyerRow({ customer, editable }: SharedProps) {
  return (
    <div className={`border-b border-line py-3.5 ${editable ? '' : 'flex-none'}`}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Bill to</div>
      {customer ? (
        <>
          <div className="text-[13px] font-bold text-ink">{customer.shopName || customer.name}</div>
          {customer.shopName && <div className="text-[12px] font-semibold text-ink-soft">{customer.name}</div>}
          <div className="mt-0.5 whitespace-pre-line text-[11.5px] leading-relaxed text-ink-soft">
            {customer.address ? `${customer.address}\n` : ''}
            {customer.state} ({gstStateCode(customer.state)})
            {customer.gstin ? ` · GSTIN ${customer.gstin}` : ''}
          </div>
        </>
      ) : (
        <div className="text-[12px] italic text-ink-faint">Select a customer to fill this in</div>
      )}
    </div>
  );
}

/** The line-items grid. Print mode takes a `lines`/`startSerial` slice for
 * just this physical page; editable mode always gets the whole list (never
 * paginated). */
function ModernItemsTable({ company, lines, editable, showDisc, onUpdateLine, onIncrement, onDecrement, onRemoveLine }: SharedProps & { lines: InvoiceSheetLine[]; showDisc: boolean }) {
  return (
    <div className={editable ? 'overflow-x-auto' : 'flex-none overflow-x-auto'}>
      <table className={`mt-4 w-full text-[12px] ${editable ? '' : 'border-collapse'}`}>
        <thead>{modernTheadRow({ editable, showDisc })}</thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={editable ? 6 : showDisc ? 5 : 4} className="py-6 text-center text-ink-faint">
                No line items yet — add products from the left.
              </td>
            </tr>
          ) : (
            lines.map((l) => (
              <tr key={l.lineId} className={editable ? 'border-b border-line' : ''}>
                {modernRowCells(l, { editable, showDisc, currency: company.currency, onUpdateLine, onIncrement, onDecrement, onRemoveLine })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TotalsRow({ k, v, negative, good, rule }: { k: string; v: string; negative?: boolean; good?: boolean; rule?: boolean }) {
  return (
    <div className={`flex justify-between px-1.5 py-1 ${rule ? 'mt-0.5 border-t border-line pt-1.5' : ''} ${negative ? 'text-red' : good ? 'font-bold text-green' : 'text-ink-soft'}`}>
      <span>{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

/** Totals ladder, amount-in-words, bank/terms/signature — computed once
 * from the *whole* invoice (never a per-page slice) and rendered exactly
 * once: inline after the items table in editable mode, or on the final
 * physical page in print mode (the caller only mounts this on the last
 * page — see InvoiceSheet below). Discounts are edited in the builder's own
 * panel, not here — this only displays them. */
function ModernClosing(props: SharedProps) {
  const { company, lines, totals, amountPaid, discountType, discountValue, editable } = props;
  const ladder = totalsLadder({ lines, totals, discountType, discountValue, rates: company });
  const money = (row: LadderRow) => `${row.sign ?? ''}${fmtInr(row.amount, company.currency)}`;

  return (
    <div className={editable ? '' : 'flex-none'}>
      <div className="mt-2 flex justify-end">
        <div className={`w-full max-w-[280px] rounded-md2 p-3 text-[12px] ${editable ? 'border border-line bg-bg' : 'border border-ink bg-transparent'}`}>
          {ladder.rows.map((row) => (
            <TotalsRow key={row.key} k={row.label} v={money(row)} negative={row.sign === '−' && row.key !== 'round-off'} rule={row.rule} />
          ))}
          <div className="mt-1.5 flex justify-between border-t-2 border-ink pt-2 text-[14px] font-extrabold text-ink">
            <span>Total due</span>
            <span key={totals.total} className="animate-total-pulse font-mono">
              {fmtInr(totals.total, company.currency)}
            </span>
          </div>
          {ladder.saved > 0 && <TotalsRow k="You saved" v={fmtInr(ladder.saved, company.currency)} good />}
          {!!amountPaid && amountPaid > 0 && (
            <>
              <TotalsRow k="Paid" v={`−${fmtInr(amountPaid, company.currency)}`} negative />
              <div className="mt-1 flex justify-between border-t border-dashed border-line px-1.5 pt-1.5 text-[12.5px] font-extrabold text-ink">
                <span>Balance due</span>
                <span className="font-mono">{fmtInr(totals.total - amountPaid, company.currency)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {totals.total > 0 && (
        <div className={`mt-3 rounded-md2 px-3.5 py-2.5 text-[11.5px] ${editable ? 'bg-brand-light text-brand-dark' : 'border border-ink bg-transparent text-ink'}`}>
          Amount in words: <b className="text-ink">Rupees {numberToWords(totals.total)} Only</b>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-5 border-t border-line pt-3.5">
        {company.pdfShowBankDetails && company.bankName && (
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Bank details</div>
            <div className="font-mono text-[11px] leading-relaxed text-ink-soft">
              {company.bankName}
              <br />
              A/C {company.bankAcc}
              <br />
              IFSC {company.ifsc}
              <br />
              {company.branch}
              {company.upi ? (
                <>
                  <br />
                  UPI {company.upi}
                </>
              ) : null}
            </div>
          </div>
        )}
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Terms</div>
          <p className="max-w-[210px] text-[10.5px] leading-relaxed text-ink-faint">{company.terms}</p>
        </div>
        <div className="text-right">
          {(props.upiQrDataUrl || props.gpayNumber) && (
            <div className="mb-2 flex flex-col items-end gap-1.5">
              {props.upiQrDataUrl && (
                <div className="flex flex-col items-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={props.upiQrDataUrl} alt="Scan to pay via UPI" className="h-[70px] w-[70px]" />
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-faint">Scan to pay via UPI</div>
                </div>
              )}
              {props.gpayNumber && (
                <div className="flex flex-col items-end">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-ink-faint">Pay via GPay</div>
                  <div className="font-mono text-[13px] font-extrabold text-ink">{props.gpayNumber}</div>
                </div>
              )}
            </div>
          )}
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">For {company.name}</div>
          <div className="ml-auto mt-[30px] w-[140px] border-t border-line pt-1.5 text-[10.5px] text-ink-faint">Authorised signatory</div>
        </div>
      </div>
    </div>
  );
}

/** Shared by the invoice builder's live preview and the saved-invoice view
 * (src/app/(app)/invoices/[id]/page.tsx) so the two can never drift — one
 * document, rendered editable or read-only. See the pagination note above
 * this file's helper functions for how the read-only path handles
 * multi-page invoices. */
export function InvoiceSheet(props: {
  company: InvoiceSheetCompany;
  customer: InvoiceSheetCustomer | null;
  date: string;
  due: string;
  invoiceNumber?: string;
  lines: InvoiceSheetLine[];
  totals: ReturnType<typeof computeTotals>;
  /** @deprecated Ignored — the "You saved" line is derived from `lines` and
   * `totals` (see totalsLadder). Still accepted so existing callers compile. */
  totalSavings?: number;
  /** Sum of Payment rows recorded against this invoice — shown as a
   * Paid/Balance line right under the total when there's a partial or full
   * payment on file. Omitted (or 0) shows nothing, same as before this
   * prop existed. */
  amountPaid?: number;
  /** The bill-level discount exactly as entered (the per-line % lives on
   * each line) — shown as its own "Bill discount" row in the totals. */
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  /** Company-level "Show a scannable UPI QR" setting, rendered above the
   * signatory block — see src/lib/qr.ts's upiQrDataUrl(). Independent of
   * gpayNumber below — either, both, or neither can be set. */
  upiQrDataUrl?: string | null;
  /** Company-level "Show GPay number" setting — this company's own phone
   * number, printed as a GPay-reachable number above the signatory block. */
  gpayNumber?: string | null;
  editable: boolean;
  /** @deprecated Ignored — discounts are edited in the builder's panel now. */
  onDiscountTypeChange?: (t: 'PERCENT' | 'FLAT') => void;
  /** @deprecated Ignored — discounts are edited in the builder's panel now. */
  onDiscountValueChange?: (v: number) => void;
  onIncrement?: (lineId: string) => void;
  onDecrement?: (lineId: string) => void;
  onUpdateLine?: (lineId: string, patch: Partial<InvoiceSheetLine>) => void;
  onRemoveLine?: (lineId: string) => void;
}) {
  const { lines, editable } = props;
  // Print shows a Disc% column only when it has something to say; the
  // builder always has the input.
  const showDisc = lines.some((l) => l.discount > 0);

  // The longest name, not just the first line, gives the measurement probe
  // a more conservative (safer) row-height reading.
  const measureLine =
    lines.length > 0
      ? lines.reduce((longest, l) => (l.name.length > longest.name.length ? l : longest), lines[0])
      : ({ lineId: '__measure__', name: 'Representative Item Name', unit: 'pcs', qty: 1, rate: 0, discount: 0 } satisfies InvoiceSheetLine);

  // Called unconditionally (rules of hooks), even in editable mode where
  // its result goes unused.
  const { heights, ready, probe } = useMeasuredSections({
    header: <ModernHeader {...props} />,
    buyer: <ModernBuyerRow {...props} />,
    itemsTableHead: modernTheadRow({ editable: false, showDisc }),
    itemsTableClassName: 'w-full border-collapse text-[12px]',
    itemRow: modernRowCells(measureLine, { editable: false, showDisc, currency: props.company.currency }),
    continuedFooter: (
      <div className="flex justify-end border-t-2 border-ink pt-3 text-right text-[11px] font-bold text-ink-soft">Continued on page 2 of 3 →</div>
    ),
    closing: <ModernClosing {...props} />,
  });

  if (editable) {
    return (
      <div className="rounded-b-lg2 border border-t-0 border-line bg-white p-[26px] pt-[26px] text-ink-body shadow-card">
        <ModernHeader {...props} />
        <ModernBuyerRow {...props} />
        <ModernItemsTable {...props} lines={lines} showDisc={showDisc} />
        <ModernClosing {...props} />
      </div>
    );
  }

  // One consistent wrapper for both the pre-measurement and final render —
  // `relative` so the hidden measurement probe's `position: absolute`
  // sizes itself against *this* container's width (without a positioned
  // ancestor, an absolutely positioned descendant resolves against the
  // page's initial containing block instead, which is wider than this
  // content column, so text wraps less in the probe than it really will
  // and every measured height comes back too short) — and using the exact
  // same wrapper for the measuring pass and the final paginated render
  // means the probe is guaranteed to measure at the same width the real
  // content ends up laid out at.
  const capacities = heights ? computeCapacities(heights) : null;
  const { pages } = capacities ? paginateLines(lines, capacities.perPage, capacities.singleCap, capacities.lastCap) : { pages: [] };

  // The card look (border, shadow, rounded corners, padding) is for the
  // on-screen preview only — printed, the page margins are the frame.
  return (
    <div className="relative rounded-b-lg2 border border-t-0 border-line bg-white p-[26px] pt-[26px] text-ink-body shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {probe}
      {/* Tells the PDF route's Playwright navigation the corrected,
          measured-and-paginated layout has committed — see route.ts's
          waitForSelector call. Only set once real pages exist, i.e. after
          the measurement pass has committed — in practice this whole
          branch is never actually painted before that, since
          useLayoutEffect corrects it synchronously before the browser's
          first paint. */}
      {ready && <div data-pdf-ready="true" style={{ display: 'none' }} />}
      {pages.map((pageLines, i) => {
        const isLast = i === pages.length - 1;
        const showBuyer = isLast ? pages.length === 1 : true;
        // Explicit pixel height, not a `flex: 1` spacer growing into a
        // `min-height` on its flex container — see the equivalent comment
        // in invoice-sheet-classic.tsx for why.
        const lastPageSpacerPx =
          isLast && heights
            ? Math.max(0, USABLE_PX - (heights.header + (showBuyer ? heights.buyer : 0) + heights.thead + pageLines.length * heights.row + heights.closing))
            : 0;
        return (
          <div key={i} className={`flex flex-col ${i > 0 ? 'mt-6' : ''} ${!isLast ? 'break-after-page' : ''}`}>
            <div className="flex flex-1 flex-col" style={isLast ? { minHeight: `${USABLE_MM}mm` } : undefined}>
              <ModernHeader {...props} />
              {showBuyer && <ModernBuyerRow {...props} />}
              {pageLines.length > 0 && <ModernItemsTable {...props} lines={pageLines} showDisc={showDisc} />}
              {/* flex-none — see the equivalent comment in
                  invoice-sheet-classic.tsx: without it, Chromium's print-
                  layout pass silently shrinks this (the only default-
                  shrinkable child) toward zero instead of honoring its
                  height. */}
              {isLast && lastPageSpacerPx > 0 && <div className="flex-none" style={{ height: `${lastPageSpacerPx}px` }} />}
              {isLast ? (
                <ModernClosing {...props} />
              ) : (
                <div className="flex justify-end border-t-2 border-ink pt-3 text-right text-[11px] font-bold text-ink-soft">Continued on page {i + 2} of {pages.length} →</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
