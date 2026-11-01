'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import {
  computeTotals,
  computeHsnSummary,
  computeUnitSummary,
  fmtInr,
  formatInvoiceDate,
  formatUnit,
  DEFAULT_HSN,
  type HsnSummaryRow,
  type UnitSummaryRow,
} from '@/lib/gst';
import { numberToWords, amountToWordsWithPaise } from '@/lib/number-to-words';
import { gstStateCode } from '@/lib/gst-state-codes';
import { computeCapacities, paginateLinesUniform, useMeasuredSections, FRAME_FILL_PX } from './print-pagination';
import { clampDiscount, printedLines, totalsLadder, type TotalsLadder } from './invoice-sheet';
import { addressLine, CleanHeader, CLEAN_FILL, CLEAN_LABEL, CLEAN_ROW_RULE, CLEAN_RULE, CLEAN_SOFT, plainAmount } from './clean-header';

export type ClassicCompany = {
  name: string;
  address?: string | null;
  gstin?: string | null;
  pan?: string | null;
  logoUrl?: string | null;
  state: string;
  fssaiNo?: string | null;
  pincode?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  email?: string | null;
  bankName?: string | null;
  bankAcc?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  upi?: string | null;
  terms?: string | null;
  cgstRate: string | number;
  sgstRate: string | number;
  igstRate: string | number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
  signatoryName?: string | null;
  signatureUrl?: string | null;
  /** Per-company display currency for printed amounts — defaults to INR via fmtInr() when absent. */
  currency?: string;
  /** PDF section toggles from Company settings — undefined behaves as "off" (hidden). */
  pdfShowBankDetails?: boolean;
  pdfShowHsnSummary?: boolean;
  /** Whether the PDF prints item / bill discounts — undefined behaves as
   * "on". Hidden ones are folded into the printed rates (printedLines). */
  pdfShowItemDiscount?: boolean;
  pdfShowBillDiscount?: boolean;
  /** Fallback HSN/SAC for a line item that has neither its own nor its
   * product's own HSN set — see schema.prisma's Company.defaultHsn comment. */
  defaultHsn?: string | null;
};

export type ClassicCustomer = {
  name: string;
  shopName?: string | null;
  address?: string | null;
  state: string;
  gstin?: string | null;
  fssaiNo?: string | null;
  pincode?: string | null;
  contact?: string | null;
  phone?: string | null;
  altPhone?: string | null;
};

export type ClassicLine = {
  lineId: string;
  productId?: string | null;
  name: string;
  unit: string;
  qty: number;
  rate: number;
  discount: number;
  hsn?: string | null;
  batch?: string | null;
  altUnit?: string | null;
  altQtyPerUnit?: number | null;
};

export type ClassicEway = {
  ewbNo?: string | null;
  ewbDate?: string | null;
  vehicleNo?: string | null;
  transportMode?: string | null;
  transporterName?: string | null;
  distanceKm?: number | null;
};

/** 'classic' — the Tally-style GST invoice. 'clean' — the CLEAN template:
 * centered letterhead, one thin rule, one font weight (see clean-header.tsx).
 * Same data, pagination, editing and HSN logic; only the markup differs. */
export type ClassicVariant = 'classic' | 'clean';

export type InvoiceSheetClassicProps = {
  /** Which GST layout to draw — Company.invoiceTemplate CLASSIC → 'classic'
   * (the default), CLEAN → 'clean'. */
  variant?: ClassicVariant;
  company: ClassicCompany;
  customer: ClassicCustomer | null;
  date: string;
  /** Due date — printed in CLEAN's invoice details strip (CLASSIC has no
   * slot for it). Omitted → that cell is left out. */
  due?: string | null;
  /** The saved invoice's number; omitted only for a brand-new unsaved one
   * (prints "—" — the real number is claimed on save). */
  invoiceNumber?: string;
  lines: ClassicLine[];
  totals: ReturnType<typeof computeTotals>;
  /** The bill-level discount exactly as entered (the per-line % lives on
   * each line) — its own "Bill discount" row in the totals ladder. */
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  irn?: string | null;
  ackNo?: string | null;
  ackDate?: string | null;
  qrImageDataUrl?: string | null;
  /** Company-level "Show a scannable UPI QR" setting — CLASSIC prints it in
   * the third column of the buyer/info row, CLEAN top-right of the
   * letterhead. See src/lib/qr.ts's upiQrDataUrl(). Independent of
   * gpayNumber below — either, both, or neither can be set. */
  upiQrDataUrl?: string | null;
  /** Company-level "Show GPay number" setting — this company's own phone
   * number, printed as a GPay-reachable number alongside the UPI QR. */
  gpayNumber?: string | null;
  eway?: ClassicEway | null;
  /** Sum of Payment rows recorded against this invoice — shown as a
   * Paid/Balance line right under the total when there's a partial or full
   * payment on file. Omitted (or 0) shows nothing. */
  amountPaid?: number;
  /** Per-invoice remarks (distinct from Company.terms, which is identical on
   * every invoice) — printed near the totals on the last page. */
  notes?: string | null;
  /** Buyer-facing delivery/dispatch note — shown in the buyer block. */
  deliveryInstructions?: string | null;
  /** Informal transport reference (vehicle/driver), shown before Delivery
   * Instructions in the buyer block — see schema.prisma's comment on
   * Invoice.showTransportDetails. Off (and its fields blank) by default;
   * distinct from the real e-Way Bill compliance data in `eway` above. */
  showTransportDetails?: boolean;
  transportVehicleNo?: string | null;
  transportDriverName?: string | null;
  transportDriverPhone?: string | null;
  editable: boolean;
  onUpdateLine?: (lineId: string, patch: Partial<ClassicLine>) => void;
  onIncrement?: (lineId: string) => void;
  onDecrement?: (lineId: string) => void;
  onRemoveLine?: (lineId: string) => void;
  /** @deprecated Ignored — discounts are edited in the builder's panel now. */
  onDiscountTypeChange?: (t: 'PERCENT' | 'FLAT') => void;
  /** @deprecated Ignored — discounts are edited in the builder's panel now. */
  onDiscountValueChange?: (v: number) => void;
  onNotesChange?: (v: string) => void;
  onDeliveryInstructionsChange?: (v: string) => void;
  onTransportVehicleNoChange?: (v: string) => void;
  onTransportDriverNameChange?: (v: string) => void;
  onTransportDriverPhoneChange?: (v: string) => void;
};

// ---------------------------------------------------------------------------
// Print pagination
//
// Line items are pre-split into explicit page-sized chunks in JS, with the
// header/buyer markup rendered fresh (ordinary duplicated markup, not a
// repeating <thead>) on every chunk — relying on the browser to repeat a
// <thead> across pages has a real, reproducible Chromium ceiling: past
// roughly 190-200px of header content it silently stops repeating past
// page 1, dumping the remaining content onto a near-empty page.
//
// The page split itself is computed from this invoice's *actual* rendered
// section heights (see print-pagination.tsx's useMeasuredSections), not
// hardcoded mm guesses — a static guess only holds until some company's
// real content (a long wrapping address, a long note, HSN summary on)
// doesn't match it, at which point the true content overflows the assumed
// budget and the browser's own pagination silently takes over mid-flow.
// ---------------------------------------------------------------------------

/** Which item-table columns exist — decided once per render and shared by
 * the header row, every body row and the measurement probe, so all three
 * always agree. */
type ColumnCfg = {
  variant: ClassicVariant;
  editable: boolean;
  hasAltQty: boolean;
  altUnitLabel: string;
  /** Disc% column: always while editing; printed only when some line
   * actually has a discount — then the rate shown is the undiscounted one,
   * so qty × rate − disc = amount reads straight across the row. */
  showDisc: boolean;
};

function columnCount({ variant, editable, hasAltQty, showDisc }: ColumnCfg): number {
  // S.No, product, HSN, qty, rate, amount (+ CLASSIC's "Per" unit column).
  return 6 + (variant === 'classic' ? 1 : 0) + (showDisc ? 1 : 0) + (hasAltQty ? 1 : 0) + (editable ? 1 : 0);
}

const CLASSIC_ITEMS_TABLE = 'w-full border-collapse text-[11px]';
const CLEAN_ITEMS_TABLE = 'w-full border-collapse text-[10.5px]';

type RowCtx = ColumnCfg & {
  company: ClassicCompany;
  /** Last row drawn on this page — no bottom rule (the next section's top
   * rule, or the page frame, is the edge; two would stack). */
  last: boolean;
  onUpdateLine?: (lineId: string, patch: Partial<ClassicLine>) => void;
  onIncrement?: (lineId: string) => void;
  onDecrement?: (lineId: string) => void;
  onRemoveLine?: (lineId: string) => void;
};

/** The items table's header row — shared between the real table and the
 * hidden measurement probe so the probe measures the exact markup that
 * actually gets printed. */
function theadRow(cfg: ColumnCfg) {
  return cfg.variant === 'clean' ? cleanTheadRow(cfg) : classicTheadRow(cfg);
}

/** One item row's `<td>` cells — shared with the measurement probe the
 * same way theadRow is. */
function rowCells(l: ClassicLine, serial: number, ctx: RowCtx) {
  return ctx.variant === 'clean' ? cleanRowCells(l, serial, ctx) : classicRowCells(l, serial, ctx);
}

function classicTheadRow({ editable, hasAltQty, altUnitLabel, showDisc }: ColumnCfg) {
  // Print mode uses a solid-ink grid (matches every body cell below it —
  // see classicRowCells) rather than the pale `border-line` used inside the
  // live builder, so the printed/exported table reads as a proper ruled
  // grid instead of faint dividers that wash out once printed or exported.
  // Bottom rule only: the section above already draws the top edge, and a
  // second (formerly 2px) one there stacked into a ~3px line.
  const colCls = editable ? 'border-r border-line px-2 py-1.5' : 'border-r border-ink px-2 py-1.5';
  return (
    <tr className={`border-b text-left uppercase tracking-wide ${editable ? 'border-ink font-semibold' : 'border-ink bg-surface-alt text-[11px] font-extrabold'}`}>
      <th className={`w-9 ${colCls}`}>S.NO</th>
      <th className={colCls}>Products</th>
      <th className={`w-[78px] ${colCls}`}>HSN/SAC</th>
      <th className={`w-[92px] ${colCls} text-right`}>Quantity</th>
      <th className={`w-[76px] ${colCls} text-right`}>Rate</th>
      <th className={`w-14 ${colCls} text-right`}>Per (Unit)</th>
      {showDisc && <th className={`w-14 ${colCls} text-right`}>Disc%</th>}
      {hasAltQty && <th className={`w-16 ${colCls} text-right`}>In {altUnitLabel}</th>}
      <th className={`w-[100px] px-2 py-1.5 text-right ${editable ? '' : 'border-ink'}`}>Amount</th>
      {editable && <th className="w-6 px-1" />}
    </tr>
  );
}

function classicRowCells(l: ClassicLine, serial: number, ctx: RowCtx) {
  const { company, editable, hasAltQty, showDisc, onUpdateLine, onIncrement, onDecrement, onRemoveLine } = ctx;
  const amount = l.qty * l.rate * (1 - l.discount / 100);
  const altQty = l.altUnit && l.altQtyPerUnit ? l.qty * l.altQtyPerUnit : null;
  // Solid-ink vertical rules in print mode, same rationale as classicTheadRow.
  const colCls = editable ? 'border-r border-line px-2 py-1 align-top' : 'border-r border-ink px-2 py-1 align-top';
  return (
    <>
      <td className={`${colCls} font-tabular`}>{serial}</td>
      <td className={colCls}>{l.name}</td>
      <td className={`${colCls} font-mono`}>
        {editable ? (
          <input
            value={l.hsn ?? ''}
            onChange={(e) => onUpdateLine?.(l.lineId, { hsn: e.target.value })}
            placeholder={company.defaultHsn || DEFAULT_HSN}
            className="w-16 rounded-sm2 border border-line bg-surface px-1 py-0.5 text-[10.5px] focus:border-brand focus:outline-none"
          />
        ) : (
          l.hsn || company.defaultHsn || DEFAULT_HSN
        )}
      </td>
      <td className={`${colCls} text-right`}>
        {editable ? (
          <QtyStepper line={l} onIncrement={onIncrement} onDecrement={onDecrement} />
        ) : (
          <span className="font-mono font-tabular">
            {l.qty} {formatUnit(l.unit)}
          </span>
        )}
      </td>
      <td className={`${colCls} text-right font-mono font-tabular`}>{fmtInr(l.rate, company.currency)}</td>
      <td className={`${colCls} text-right`}>{formatUnit(l.unit)}</td>
      {showDisc && (
        <td className={`${colCls} text-right font-tabular`}>
          {editable ? <DiscountInput line={l} onUpdateLine={onUpdateLine} /> : l.discount ? Number(l.discount) : ''}
        </td>
      )}
      {hasAltQty && <td className={`${colCls} text-right font-mono font-tabular`}>{altQty !== null ? altQty.toFixed(2).replace(/\.00$/, '') : ''}</td>}
      <td className="px-2 py-1 text-right align-top font-mono font-tabular">{fmtInr(amount, company.currency)}</td>
      {editable && (
        <td className="px-1 py-1 align-top">
          <RemoveButton line={l} onRemoveLine={onRemoveLine} />
        </td>
      )}
    </>
  );
}

function cleanTheadRow({ editable, hasAltQty, altUnitLabel, showDisc }: ColumnCfg) {
  const th = `${CLEAN_FILL} border-b ${CLEAN_RULE} px-1.5 py-1.5 text-[9px] uppercase tracking-[0.06em]`;
  const sep = `border-l ${CLEAN_RULE}`;
  return (
    <tr className="text-left">
      <th className={`${th} w-[34px] text-center`}>S.No</th>
      <th className={`${th} ${sep}`}>Product</th>
      <th className={`${th} ${sep} ${editable ? 'w-[84px]' : 'w-[72px]'}`}>HSN/SAC</th>
      <th className={`${th} ${sep} ${editable ? 'w-[108px]' : 'w-[70px]'} text-right`}>Qty</th>
      <th className={`${th} ${sep} w-[66px] text-right`}>Rate</th>
      {showDisc && <th className={`${th} ${sep} ${editable ? 'w-[60px]' : 'w-[50px]'} text-right`}>Disc%</th>}
      {hasAltQty && <th className={`${th} ${sep} w-[64px] text-right`}>In {altUnitLabel}</th>}
      <th className={`${th} ${sep} w-[86px] text-right`}>Amount</th>
      {editable && <th className={`${th} ${sep} w-7`} />}
    </tr>
  );
}

function cleanRowCells(l: ClassicLine, serial: number, ctx: RowCtx) {
  const { company, editable, hasAltQty, showDisc, last, onUpdateLine, onIncrement, onDecrement, onRemoveLine } = ctx;
  const amount = l.qty * l.rate * (1 - l.discount / 100);
  const altQty = l.altUnit && l.altQtyPerUnit ? l.qty * l.altQtyPerUnit : null;
  const td = `px-1.5 py-1.5 align-top ${last ? '' : `border-b ${CLEAN_ROW_RULE}`}`;
  const sep = `border-l ${CLEAN_RULE}`;
  return (
    <>
      <td className={`${td} text-center`}>{serial}</td>
      <td className={`${td} ${sep}`}>{l.name}</td>
      <td className={`${td} ${sep}`}>
        {editable ? (
          <input
            value={l.hsn ?? ''}
            onChange={(e) => onUpdateLine?.(l.lineId, { hsn: e.target.value })}
            placeholder={company.defaultHsn || DEFAULT_HSN}
            className="w-[70px] rounded-sm2 border border-line bg-surface px-1 py-0.5 text-[10.5px] focus:border-brand focus:outline-none"
          />
        ) : (
          l.hsn || company.defaultHsn || DEFAULT_HSN
        )}
      </td>
      <td className={`${td} ${sep} whitespace-nowrap text-right`}>
        {editable ? <QtyStepper line={l} onIncrement={onIncrement} onDecrement={onDecrement} /> : `${l.qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${formatUnit(l.unit)}`}
      </td>
      <td className={`${td} ${sep} text-right`}>{plainAmount(l.rate, company.currency)}</td>
      {showDisc && <td className={`${td} ${sep} text-right`}>{editable ? <DiscountInput line={l} onUpdateLine={onUpdateLine} /> : l.discount ? Number(l.discount) : ''}</td>}
      {hasAltQty && <td className={`${td} ${sep} text-right`}>{altQty !== null ? altQty.toFixed(2).replace(/\.00$/, '') : ''}</td>}
      <td className={`${td} ${sep} text-right`}>{plainAmount(amount, company.currency)}</td>
      {editable && (
        <td className={`${td} ${sep} px-0.5`}>
          <RemoveButton line={l} onRemoveLine={onRemoveLine} />
        </td>
      )}
    </>
  );
}

function QtyStepper({ line: l, onIncrement, onDecrement }: { line: ClassicLine; onIncrement?: (id: string) => void; onDecrement?: (id: string) => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={() => onDecrement?.(l.lineId)} aria-label={`Decrease ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-sm2 border border-line">
        <Minus size={9} />
      </button>
      <span className="min-w-[24px] text-center font-tabular">
        {l.qty} {formatUnit(l.unit)}
      </span>
      <button type="button" onClick={() => onIncrement?.(l.lineId)} aria-label={`Increase ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-sm2 border border-line">
        <Plus size={9} />
      </button>
    </div>
  );
}

function DiscountInput({ line: l, onUpdateLine }: { line: ClassicLine; onUpdateLine?: (lineId: string, patch: Partial<ClassicLine>) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={100}
      step="1"
      value={l.discount}
      aria-label={`${l.name} discount %`}
      onChange={(e) => onUpdateLine?.(l.lineId, { discount: clampDiscount(e.target.value) })}
      className="w-12 rounded-sm2 border border-line bg-surface px-1 py-0.5 text-right text-[10.5px] focus:border-brand focus:outline-none"
    />
  );
}

function RemoveButton({ line: l, onRemoveLine }: { line: ClassicLine; onRemoveLine?: (lineId: string) => void }) {
  return (
    <button type="button" onClick={() => onRemoveLine?.(l.lineId)} aria-label={`Remove ${l.name}`} className="flex h-[20px] w-[20px] items-center justify-center rounded-sm2 text-ink-faint hover:text-destructive">
      <Trash2 size={11} />
    </button>
  );
}

/** The CLASSIC (Tally/ERP-style) GST tax invoice — and, with
 * `variant="clean"`, the CLEAN template — a distinct layout from
 * InvoiceSheet, selected per-Company via Company.invoiceTemplate (see
 * src/lib/invoice-template.ts's isGstLayout). Mirrors a real
 * dairy-distributor tax invoice: IRN/QR + Ack block, buyer FSSAI/contact,
 * HSN/SAC item table (with per-line and bill discount, and an optional
 * secondary-quantity column), the shared totals ladder (see
 * invoice-sheet.tsx's totalsLadder), HSN-wise tax summary with its own
 * "Tax Amount (in words)" line, Bank Details/Terms (from Company settings),
 * and a Customer's Sign / Authorised Signatory row. See
 * invoice-eway-bill-sheet.tsx for the companion printed e-Way Bill page.
 *
 * `editable` never gets printed directly (the builder's preview and the
 * print page both instantiate a separate editable={false} element), so it
 * stays a single continuous flow — no pagination, no print-specific layout
 * tricks, just the plain editing UI. Only the editable={false} render path
 * below deals with physical pages at all. */
export function InvoiceSheetClassic(props: InvoiceSheetClassicProps) {
  const { company, customer, totals, discountType, discountValue, editable } = props;
  const variant: ClassicVariant = props.variant ?? 'classic';
  // Printed, a discount the company hides is folded into the lines' rates
  // (see printedLines); the builder always edits the real ones. Totals,
  // and the HSN split below, always come from the real lines.
  const showBillDiscount = editable || company.pdfShowBillDiscount !== false;
  const lines = editable
    ? props.lines
    : printedLines(props.lines, totals, { itemDiscount: company.pdfShowItemDiscount !== false, billDiscount: showBillDiscount });
  const isClean = variant === 'clean';

  // The bill discount is handed to the HSN split as the exact amount
  // computeTotals took off (not re-derived from discountType/Value), so the
  // HSN rows always sum back to the invoice's own taxable value — re-applying
  // a % on top of already-discounted lines is how it used to double-count.
  const hsnRows = customer
    ? computeHsnSummary(
        props.lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount, hsn: l.hsn })),
        { type: 'FLAT', value: totals.overallDiscountAmount },
        {
          cgstRate: Number(company.cgstRate),
          sgstRate: Number(company.sgstRate),
          igstRate: Number(company.igstRate),
          cgstEnabled: company.cgstEnabled,
          sgstEnabled: company.sgstEnabled,
          igstEnabled: company.igstEnabled,
        },
        company.state,
        customer.state,
        company.defaultHsn || DEFAULT_HSN
      )
    : [];
  const hsnTotal = hsnRows.reduce(
    (acc, r) => ({
      taxableValue: acc.taxableValue + r.taxableValue,
      cgstAmount: acc.cgstAmount + r.cgstAmount,
      sgstAmount: acc.sgstAmount + r.sgstAmount,
      igstAmount: acc.igstAmount + r.igstAmount,
      totalTax: acc.totalTax + r.totalTax,
    }),
    { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0 }
  );
  const unitSummary = computeUnitSummary(lines);
  const hasAltQty = lines.some((l) => l.altUnit && l.altQtyPerUnit);
  const altUnitLabel = lines.find((l) => l.altUnit)?.altUnit ?? '';
  const anyLineDiscount = lines.some((l) => l.discount > 0);
  // Whether this invoice actually charges any GST — checked against the
  // computed tax amounts (not just the enabled toggles) so a tax that's
  // switched on but rated at 0% is treated the same as one switched off:
  // either way there's nothing real to show, and a row/column of "0%" /
  // ₹0.00 reads as broken rather than as "no tax applies here".
  const gstEnabled = totals.cgst > 0 || totals.sgst > 0 || totals.igst > 0;
  const showHsn = !!(company.pdfShowHsnSummary && gstEnabled && hsnRows.length > 0);
  const ladder = totalsLadder({ lines, totals, discountType, discountValue, rates: company, showBillDiscount });
  const cols: ColumnCfg = { variant, editable, hasAltQty, altUnitLabel, showDisc: editable || anyLineDiscount };
  const shared: SharedProps = { ...props, lines, variant, hsnRows, hsnTotal, unitSummary, hasAltQty, altUnitLabel, showHsn, gstEnabled, ladder, cols };

  const Header = isClean ? CleanHeaderSection : ClassicHeader;
  const Buyer = isClean ? CleanParties : ClassicBuyerRow;
  const Items = isClean ? CleanItemsTable : ClassicItemsTable;
  const Closing = isClean ? CleanClosing : ClassicClosing;

  // The longest name in the invoice, not just the first line, gives the
  // measurement probe a more conservative (safer) row-height reading —
  // a rare unusually-long product name shouldn't be able to skew the
  // split if it happens to land anywhere other than line 1.
  const measureLine =
    lines.length > 0
      ? lines.reduce((longest, l) => (l.name.length > longest.name.length ? l : longest), lines[0])
      : ({ lineId: '__measure__', name: 'Representative Item Name', unit: 'pcs', qty: 1, rate: 0, discount: 0 } satisfies ClassicLine);
  const printCols: ColumnCfg = { ...cols, editable: false, showDisc: anyLineDiscount };

  // Called unconditionally (rules of hooks) even in editable mode, where
  // its result is simply unused — every real call site passes a fixed,
  // never-toggled `editable` prop, but keeping the hook call itself
  // unconditional avoids relying on that.
  const { heights, ready, probe } = useMeasuredSections({
    header: <Header {...shared} />,
    buyer: <Buyer {...shared} />,
    itemsTableHead: theadRow(printCols),
    itemsTableClassName: isClean ? CLEAN_ITEMS_TABLE : CLASSIC_ITEMS_TABLE,
    itemRow: rowCells(measureLine, 1, { ...printCols, company, last: false }),
    // No "Continued on Page N" footer is rendered between pages anymore —
    // nothing to measure/reserve room for.
    continuedFooter: null,
    closing: <Closing {...shared} />,
  });

  // CLEAN's one-weight/one-family rule (`.invoice-clean` in globals.css) and
  // base size sit on the outermost wrapper so the measurement probe gets
  // them too.
  const typeCls = isClean ? 'invoice-clean text-[10.5px] leading-[1.45]' : 'text-[11.5px] leading-normal';
  const frameCls = isClean ? `border ${CLEAN_RULE}` : 'border border-ink';

  if (editable) {
    return (
      <div className={`rounded-b-lg2 border border-t-0 border-line bg-white p-5 text-ink-body shadow-card ${typeCls}`}>
        <div className={frameCls}>
          <Header {...shared} />
          <Buyer {...shared} />
          <Items {...shared} />
          <Closing {...shared} />
        </div>
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
  const { pages } = capacities ? paginateLinesUniform(lines, capacities.perPage) : { pages: [] };
  let serial = 0;

  return (
    <div
      className={`relative rounded-b-lg2 border border-t-0 border-line bg-white p-5 text-ink-body shadow-card print:rounded-none print:border-none print:p-0 print:shadow-none ${typeCls}`}
    >
      {probe}
      {/* Tells the PDF renderer (src/lib/invoice-pdf.ts) the corrected,
          measured-and-paginated layout has committed. Only set once real
          pages exist — see the equivalent spot in invoice-sheet.tsx. */}
      {ready && <div data-pdf-ready="true" style={{ display: 'none' }} />}
      {pages.map((pageLines, i) => {
        const startSerial = serial;
        serial += pageLines.length;
        const isLast = i === pages.length - 1;
        // Non-last pages always repeat the buyer block (buyer info hasn't
        // appeared yet otherwise); the true last page only shows it when
        // this is genuinely the only page — a multi-page invoice's last
        // page drops it to make room for the closing block instead (it
        // already appeared on page 1).
        const showBuyer = isLast ? pages.length === 1 : true;
        // CLEAN's frame runs the item columns down to the closing block, so
        // a short invoice still reads as one full ruled page (as on paper
        // stationery). Only when everything provably fits under
        // FRAME_FILL_PX — explicit pixels from measured heights (+2 for the
        // frame's own borders), never a flex/min-height stretch, which is
        // what used to spill a few mm over and print an extra blank page.
        // Otherwise no filler at all, and the closing flows on naturally as
        // in CLASSIC.
        const fillPx =
          isClean && isLast && heights
            ? Math.floor(FRAME_FILL_PX - (heights.header + (showBuyer ? heights.buyer : 0) + heights.thead + pageLines.length * heights.row + heights.closing + 2))
            : 0;
        return (
          <div key={i} className={`invoice-page flex flex-col ${i > 0 ? 'mt-6 print:mt-0' : ''} ${!isLast ? 'print:break-after-page ' : ''}`}>
            <div className={`invoice-page-inner flex flex-1 flex-col ${frameCls}`}>
              <Header {...shared} />
              {showBuyer && <Buyer {...shared} />}
              {pageLines.length > 0 && <Items {...shared} lines={pageLines} startSerial={startSerial} fillPx={fillPx > 12 ? fillPx : 0} />}
              {/* The closing block (totals/HSN/bank/signature)
                  on the true last page flows in normal document order right
                  after the item table. Every sub-section inside it has its
                  own `break-inside-avoid`, so if it doesn't all fit on this
                  physical page, Chromium's native print pagination keeps
                  each section intact and continues the rest — typically
                  just the signature block — at the top of a following page. */}
              {isLast && <Closing {...shared} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** InvoiceSheetClassic's props plus the values it derives once per render —
 * what every section component below receives. */
type SharedProps = InvoiceSheetClassicProps & {
  variant: ClassicVariant;
  hsnRows: HsnSummaryRow[];
  hsnTotal: { taxableValue: number; cgstAmount: number; sgstAmount: number; igstAmount: number; totalTax: number };
  unitSummary: UnitSummaryRow[];
  hasAltQty: boolean;
  altUnitLabel: string;
  showHsn: boolean;
  gstEnabled: boolean;
  ladder: TotalsLadder;
  cols: ColumnCfg;
};

type ItemsProps = SharedProps & { startSerial?: number; fillPx?: number };

// ---------------------------------------------------------------------------
// Shared buyer-block inputs (both variants)
// ---------------------------------------------------------------------------

const INPUT_CLS = 'w-full rounded-sm2 border border-line bg-surface px-1.5 py-1 text-[10.5px] focus:border-brand focus:outline-none';

function hasTransport(p: SharedProps): boolean {
  return !!(p.transportVehicleNo?.trim() || p.transportDriverName?.trim() || p.transportDriverPhone?.trim());
}

/** Opt-in per invoice (builder Settings → "Show on invoice PDF"), and even
 * then only printed once something's filled in — turning it on with
 * nothing entered doesn't leave an empty box on the PDF. */
function showTransportBlock(p: SharedProps): boolean {
  return !!p.showTransportDetails && (p.editable || hasTransport(p));
}

function TransportInputs(p: SharedProps) {
  return (
    <div className="mt-0.5 space-y-1">
      <input value={p.transportVehicleNo ?? ''} onChange={(e) => p.onTransportVehicleNoChange?.(e.target.value)} placeholder="Vehicle number" className={INPUT_CLS} />
      <input value={p.transportDriverName ?? ''} onChange={(e) => p.onTransportDriverNameChange?.(e.target.value)} placeholder="Driver name" className={INPUT_CLS} />
      <input value={p.transportDriverPhone ?? ''} onChange={(e) => p.onTransportDriverPhoneChange?.(e.target.value)} placeholder="Driver contact number" className={INPUT_CLS} />
    </div>
  );
}

function DeliveryInput(p: SharedProps) {
  return (
    <textarea
      value={p.deliveryInstructions ?? ''}
      onChange={(e) => p.onDeliveryInstructionsChange?.(e.target.value)}
      placeholder="e.g. Deliver before 10 AM via rear gate, call security on arrival"
      rows={2}
      className={`mt-0.5 resize-none ${INPUT_CLS}`}
    />
  );
}

function NotesInput(p: SharedProps) {
  return <textarea value={p.notes ?? ''} onChange={(e) => p.onNotesChange?.(e.target.value)} placeholder="Any remarks specific to this invoice…" rows={2} className={`resize-none ${INPUT_CLS}`} />;
}

// ---------------------------------------------------------------------------
// CLASSIC sections
// ---------------------------------------------------------------------------

/** Letterhead: logo, company details, invoice No./Date — identical markup
 * rendered fresh on every physical page (see the pagination note above for
 * why this isn't a repeating <thead> instead). Table/table-cell layout, not
 * flexbox, purely for print-safety consistency with the rest of the sheet. */
function ClassicHeader({ company, invoiceNumber, date }: SharedProps) {
  return (
    <div className="flex-none">
      <div className="border-b border-ink bg-surface-alt py-2 text-center text-[16px] font-extrabold uppercase tracking-[0.14em] text-ink">Tax Invoice</div>
      <table className="w-full border-b border-ink">
        <tbody>
          <tr>
            {/* Fixed 65% width (not max-width, which table cells only treat
                as a hint under auto table-layout) so the address/GSTIN text
                reliably wraps inside its own column instead of running past
                it toward the invoice-number cell for a longer address. */}
            <td className="w-[65%] p-2 align-top">
              <div className="flex items-start gap-2.5">
                {company.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={company.logoUrl}
                    alt=""
                    className="h-11 w-11 flex-none rounded-sm2 border border-line object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="min-w-0 leading-snug">
                  <div className="text-[17px] font-extrabold tracking-tight text-ink">{company.name}</div>
                  {company.address && <div className="whitespace-pre-line text-[10.5px] leading-tight">{company.address}</div>}
                  <div className="mt-1 text-[10.5px]">
                    <span className="font-mono font-tabular">GSTIN: {company.gstin || '—'}</span>
                    <span className="text-ink-faint"> · </span>
                    State {company.state} (<span className="font-mono font-tabular">{gstStateCode(company.state)}</span>)
                    {company.fssaiNo && (
                      <>
                        <span className="text-ink-faint"> · </span>FSSAI {company.fssaiNo}
                      </>
                    )}
                  </div>
                  {(company.phone || company.email) && (
                    <div className="text-[10.5px]">
                      {company.phone && (
                        <span className="font-mono font-tabular">
                          {company.phone}
                          {company.altPhone ? `, ${company.altPhone}` : ''}
                        </span>
                      )}
                      {company.phone && company.email && <span className="text-ink-faint"> · </span>}
                      {company.email}
                    </div>
                  )}
                </div>
              </div>
            </td>
            {/* Invoice No./Date belong top-right, next to the seller block —
                the standard placement on a printed GST tax invoice. */}
            <td className="w-[35%] p-2 text-right align-top">
              <div className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">Invoice No.</div>
              {/* No number exists yet for a brand-new unsaved invoice — the
                  real one is only claimed from the sequential counter on
                  Save, so this never shows a workflow-status word like
                  "Draft" on a customer-facing PDF. */}
              <div className="font-mono font-tabular text-[19.5px] font-extrabold text-ink">{invoiceNumber ?? '—'}</div>
              <div className="mt-0.5 text-[10.5px] text-ink-soft">
                Dated <span className="font-mono font-tabular font-semibold text-ink-body">{formatInvoiceDate(date)}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Three-column info strip below the letterhead — buyer details, delivery/
 * transport info + e-Invoice compliance QR, and the payment UPI QR/GPay
 * number — same repeat-per-page treatment as the letterhead above. */
function ClassicBuyerRow(p: SharedProps) {
  const { customer, deliveryInstructions, editable, irn, ackNo, ackDate, qrImageDataUrl, eway, upiQrDataUrl, gpayNumber } = p;
  // Payment QR/GPay get their own third column — shown only when the
  // company actually has one of them configured, same opt-in gating as the
  // rest of this row, rather than an empty column on every invoice.
  const hasPaymentQr = !!(upiQrDataUrl || gpayNumber);
  return (
    <table className="w-full flex-none border-b border-ink">
      <tbody>
        <tr>
          {/* Column 1 — Buyer (Bill to). */}
          <td className="min-w-[210px] border-r border-line p-1.5 align-top leading-snug">
            <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-faint">Buyer (Bill to)</div>
            {customer ? (
              <>
                <div className="text-[12px] font-bold text-ink">{customer.shopName || customer.name}</div>
                {customer.shopName && customer.name && <div className="text-[10px] font-semibold text-ink-body">{customer.name}</div>}
                {customer.address && <div className="whitespace-pre-line text-[10px] leading-tight">{customer.address}</div>}
                <div className="mt-0.5 text-[10px]">
                  {customer.gstin && (
                    <>
                      <span className="font-mono font-tabular">GSTIN: {customer.gstin}</span>
                      <span className="text-ink-faint"> · </span>
                    </>
                  )}
                  State {customer.state} (<span className="font-mono font-tabular">{gstStateCode(customer.state)}</span>)
                  {customer.fssaiNo && (
                    <>
                      <span className="text-ink-faint"> · </span>FSSAI {customer.fssaiNo}
                    </>
                  )}
                </div>
                {(customer.contact || customer.phone) && (
                  <div className="text-[10px]">
                    {customer.contact && <>Contact: {customer.contact}</>}
                    {customer.contact && customer.phone && <span className="text-ink-faint"> · </span>}
                    {customer.phone && (
                      <span className="font-mono font-tabular">
                        Phone: {customer.phone}
                        {customer.altPhone ? `, ${customer.altPhone}` : ''}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="italic text-ink-faint">Select a customer to fill this in</div>
            )}
          </td>

          {/* Column 2 — Delivery Instructions, Transport (vehicle/driver)
              details, and the e-Invoice compliance QR/IRN (distinct from
              the payment QR in column 3). */}
          <td className={`p-1.5 align-top ${hasPaymentQr ? 'border-r border-line' : ''}`}>
            {showTransportBlock(p) && (
              <div className="mb-1.5 rounded-sm2 border border-dashed border-line p-1.5">
                <div className="text-[9px] font-bold uppercase tracking-wide text-ink-faint">Transport Details</div>
                {editable ? (
                  <TransportInputs {...p} />
                ) : (
                  <div className="mt-0.5 space-y-0.5 text-[10px]">
                    {p.transportVehicleNo?.trim() && (
                      <div>
                        Vehicle No. : <span className="font-mono font-tabular">{p.transportVehicleNo}</span>
                      </div>
                    )}
                    {p.transportDriverName?.trim() && <div>Driver : {p.transportDriverName}</div>}
                    {p.transportDriverPhone?.trim() && (
                      <div>
                        Driver Contact : <span className="font-mono font-tabular">{p.transportDriverPhone}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Fixed, always-visible box (not gated on having content) so
                its position is predictable invoice to invoice — a delivery
                crew always finds it in the same place. */}
            <div className="mb-1.5 rounded-sm2 border border-dashed border-line p-1.5">
              <div className="text-[9px] font-bold uppercase tracking-wide text-ink-faint">Delivery Instructions</div>
              {editable ? <DeliveryInput {...p} /> : <div className="mt-0.5 min-h-[10px] whitespace-pre-line text-[10px]">{deliveryInstructions || '—'}</div>}
            </div>
            {irn ? (
              <div className="flex items-start gap-2">
                {qrImageDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrImageDataUrl} alt="e-Invoice QR" className="h-[70px] w-[70px] flex-none" />
                )}
                <div className="min-w-0">
                  <div className="font-bold uppercase tracking-wide text-ink-faint">e-Invoice</div>
                  <div className="max-w-[220px] break-all font-mono text-[10px]">IRN : {irn}</div>
                  {ackNo && <div className="font-tabular">Ack No. : {ackNo}</div>}
                  {ackDate && <div className="font-tabular">Ack Date : {formatInvoiceDate(ackDate)}</div>}
                </div>
              </div>
            ) : (
              <div className="inline-block rounded-sm2 border border-dashed border-line px-3 py-2 text-[10.5px] text-ink-faint print:hidden">e-Invoice not generated yet</div>
            )}
            {(eway?.ewbNo || eway?.vehicleNo) && (
              <div className="mt-2 space-y-0.5 border-t border-dashed border-line pt-1.5">
                {eway?.ewbNo && <Row k="e-Way Bill No." v={eway.ewbNo} mono />}
                {eway?.vehicleNo && <Row k="Vehicle No." v={eway.vehicleNo} mono />}
              </div>
            )}
          </td>

          {/* Column 3 — Payment UPI QR + GPay number (visible as soon as the
              buyer opens the invoice, not just on the last physical page of
              a multi-page one). */}
          {hasPaymentQr && (
            <td className="w-[130px] p-1.5 text-center align-top">
              {upiQrDataUrl && (
                <div className="flex flex-col items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={upiQrDataUrl} alt="Scan to pay via UPI" className="h-[80px] w-[80px]" />
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-ink-faint">Scan to pay via UPI</div>
                </div>
              )}
              {gpayNumber && (
                <div className={upiQrDataUrl ? 'mt-2' : ''}>
                  <div className="text-[9px] font-bold uppercase tracking-wide text-ink-faint">Pay via GPay</div>
                  <div className="font-mono text-[12.5px] font-extrabold text-ink">{gpayNumber}</div>
                </div>
              )}
            </td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

/** The line-items grid. Print mode takes a `lines`/`startSerial` slice for
 * just this physical page; editable mode always gets the whole list (never
 * paginated — see the component doc comment). */
function ClassicItemsTable({ company, lines, editable, cols, onUpdateLine, onIncrement, onDecrement, onRemoveLine, startSerial }: ItemsProps) {
  const base = startSerial ?? 0;
  return (
    <div className="flex-none overflow-x-auto print:overflow-visible">
      <table className={`${CLASSIC_ITEMS_TABLE} print:min-w-0 ${editable ? 'min-w-[720px]' : 'min-w-[640px]'}`}>
        <thead>{theadRow(cols)}</thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={columnCount(cols)} className="py-6 text-center text-ink-faint">
                No line items yet.
              </td>
            </tr>
          ) : (
            lines.map((l, i) => {
              const last = i === lines.length - 1;
              return (
                // No bottom rule on the page's last row: the closing block's
                // top rule (or the page frame) is that edge.
                <tr key={l.lineId} className={last ? '' : editable ? 'border-b border-line' : 'border-b border-ink'}>
                  {rowCells(l, base + i + 1, { ...cols, company, last, onUpdateLine, onIncrement, onDecrement, onRemoveLine })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Totals ladder, quantity and amount in words, HSN breakup, bank/terms,
 * notes and signatures — computed once from the *whole* invoice
 * (never a per-page slice) and rendered exactly once: inline after the
 * items table in editable mode, or on the final physical page in print
 * mode (the caller only mounts this on the last page — see
 * InvoiceSheetClassic above). */
function ClassicClosing(props: SharedProps) {
  const { company, lines, totals, ladder, editable, amountPaid, unitSummary, showHsn, hsnRows, hsnTotal, notes } = props;

  return (
    <div className="flex-none">
      {/* Words and quantity sit beside the ladder rather than in rows of
          their own below it — that space was empty anyway, and the ladder
          now has more steps than the old Subtotal/Discount block, so this
          keeps the signature row on the page as often as before. */}
      <div className="grid grid-cols-[minmax(0,1fr)_290px] border-t border-ink break-inside-avoid">
        <div className="border-r border-line">
          {lines.length > 0 && (
            <div className="border-b border-line p-1.5">
              <span className="font-bold">Total Quantity : </span>
              {unitSummary.map((r) => `${r.qty.toLocaleString('en-IN')} ${formatUnit(r.unit)}`).join(', ')}
            </div>
          )}
          <div className="p-1.5">
            <span className="font-bold">Amount Chargeable (in words) : </span>
            INR {numberToWords(totals.total)} Only
          </div>
        </div>
        <table className="w-full self-start border-collapse text-[11px]">
          <tbody>
            {ladder.rows.map((row) => (
              <tr key={row.key} className={row.rule ? 'border-t border-line' : ''}>
                <td className="px-2.5 py-0.5 text-right font-bold">{row.label}</td>
                <td className="w-[120px] px-2.5 py-0.5 text-right font-mono font-tabular">
                  {row.sign ?? ''}
                  {fmtInr(row.amount, company.currency)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-ink bg-surface-alt">
              <td className="px-2.5 py-1.5 text-right text-[13px] font-extrabold">Total</td>
              <td className="px-2.5 py-1.5 text-right font-mono font-tabular text-[13px] font-extrabold">{fmtInr(totals.total, company.currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {!!amountPaid && amountPaid > 0 && (
        <div className="flex justify-end border-t border-line p-1.5 break-inside-avoid">
          <div className="w-full max-w-[220px] text-[11.5px]">
            <div className="flex justify-between text-green">
              <span>Paid</span>
              <span className="font-mono font-tabular font-bold">−{fmtInr(amountPaid, company.currency)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-dashed border-ink pt-1 text-[12.5px] font-extrabold text-ink">
              <span>Balance due</span>
              <span className="font-mono font-tabular">{fmtInr(totals.total - amountPaid, company.currency)}</span>
            </div>
          </div>
        </div>
      )}

      {showHsn && (
        <>
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[560px] border-collapse border-t border-ink text-[10.5px] print:min-w-0">
              <thead>
                <tr className="border-b border-ink bg-surface-alt text-left font-bold">
                  <th className="border-r border-line px-2.5 py-1">HSN/SAC</th>
                  <th className="border-r border-line px-2.5 py-1 text-right">Taxable Value</th>
                  {totals.useIgst ? (
                    <>
                      <th className="border-r border-line px-2.5 py-1 text-right">IGST Rate</th>
                      <th className="border-r border-line px-2.5 py-1 text-right">IGST Amount</th>
                    </>
                  ) : (
                    <>
                      <th className="border-r border-line px-2.5 py-1 text-right">CGST Rate</th>
                      <th className="border-r border-line px-2.5 py-1 text-right">CGST Amt</th>
                      <th className="border-r border-line px-2.5 py-1 text-right">SGST Rate</th>
                      <th className="border-r border-line px-2.5 py-1 text-right">SGST Amt</th>
                    </>
                  )}
                  <th className="px-2.5 py-1 text-right">Total Tax Amount</th>
                </tr>
              </thead>
              <tbody>
                {hsnRows.map((r) => (
                  <tr key={r.hsn} className="border-b border-line">
                    <td className="border-r border-line px-2.5 py-1 font-mono">{r.hsn}</td>
                    <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.taxableValue, company.currency)}</td>
                    {totals.useIgst ? (
                      <>
                        <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{r.igstRate}%</td>
                        <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.igstAmount, company.currency)}</td>
                      </>
                    ) : (
                      <>
                        <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{r.cgstRate}%</td>
                        <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.cgstAmount, company.currency)}</td>
                        <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{r.sgstRate}%</td>
                        <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.sgstAmount, company.currency)}</td>
                      </>
                    )}
                    <td className="px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(r.totalTax, company.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink bg-surface-alt font-bold">
                  <td className="border-r border-line px-2.5 py-1">Total</td>
                  <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.taxableValue, company.currency)}</td>
                  {totals.useIgst ? (
                    <>
                      <td className="border-r border-line px-2.5 py-1" />
                      <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.igstAmount, company.currency)}</td>
                    </>
                  ) : (
                    <>
                      <td className="border-r border-line px-2.5 py-1" />
                      <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.cgstAmount, company.currency)}</td>
                      <td className="border-r border-line px-2.5 py-1" />
                      <td className="border-r border-line px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.sgstAmount, company.currency)}</td>
                    </>
                  )}
                  <td className="px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(hsnTotal.totalTax, company.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="border-t border-line p-1.5 break-inside-avoid">
            <span className="font-bold">Tax Amount (in words) : </span>
            INR {amountToWordsWithPaise(hsnTotal.totalTax)} Only
          </div>
        </>
      )}

      {((company.pdfShowBankDetails && company.bankName) || company.terms) && (
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-line p-1.5 text-[10.5px] break-inside-avoid">
          <div className="flex flex-1 flex-wrap gap-4">
            {company.pdfShowBankDetails && company.bankName && (
              <div>
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Bank Details</div>
                <div className="font-mono font-tabular leading-snug text-ink-body">
                  {company.bankName}
                  {company.bankAcc && (
                    <>
                      <br />
                      A/C {company.bankAcc}
                    </>
                  )}
                  {company.ifsc && (
                    <>
                      <br />
                      IFSC {company.ifsc}
                    </>
                  )}
                  {company.branch && (
                    <>
                      <br />
                      {company.branch}
                    </>
                  )}
                  {company.upi && (
                    <>
                      <br />
                      UPI {company.upi}
                    </>
                  )}
                </div>
              </div>
            )}
            {company.terms && (
              <div>
                <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Terms</div>
                <p className="leading-snug text-ink-soft">{company.terms}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {(editable || notes) && (
        <div className="border-t border-line p-1.5 break-inside-avoid">
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Notes</div>
          {editable ? <NotesInput {...props} /> : notes && <p className="whitespace-pre-line leading-snug text-ink-soft">{notes}</p>}
        </div>
      )}

      <div className="border-t border-line p-1.5 break-inside-avoid">
        <div className="mt-1 grid grid-cols-2 gap-8 text-center text-[10.5px]">
          <div className="flex flex-col">
            <div className="h-9" />
            <div className="border-t border-ink pt-1">Customer&apos;s Sign</div>
          </div>
          <div className="flex flex-col">
            <div className="flex h-9 items-end justify-center pb-1">
              {company.signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.signatureUrl}
                  alt="Authorised signature"
                  className="h-8 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-[11.5px] font-semibold text-ink">{company.signatoryName || ''}</span>
              )}
            </div>
            <div className="border-t border-ink pt-1">
              Authorised Signatory
              <div className="text-[9.5px] font-normal text-ink-faint">for {company.name}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 py-[1px]">
      <span className="text-ink-faint">{k}</span>
      <span className={mono ? 'font-mono font-tabular' : ''}>{v}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLEAN sections — every section draws only its top rule (the page frame
// draws the outer edge), so no two borders ever meet. See clean-header.tsx.
// ---------------------------------------------------------------------------

function CleanHeaderSection(p: SharedProps) {
  return (
    <CleanHeader
      company={p.company}
      invoiceNumber={p.invoiceNumber}
      date={p.date}
      due={p.due}
      placeOfSupply={p.customer?.state}
      upiQrDataUrl={p.upiQrDataUrl}
      gpayNumber={p.gpayNumber}
      irn={p.irn}
      ackNo={p.ackNo}
      ackDate={p.ackDate}
      qrImageDataUrl={p.qrImageDataUrl}
    />
  );
}

/** Bill to (left) · delivery instructions, transport and e-Way Bill
 * (right). The right column only exists when it has something to say, so a
 * plain invoice doesn't carry an empty box. The GPay number prints under
 * the UPI QR in the letterhead (CleanHeader). */
function CleanParties(p: SharedProps) {
  const { customer, editable, deliveryInstructions, eway } = p;
  const showDelivery = editable || !!deliveryInstructions?.trim();
  const showTransport = showTransportBlock(p);
  const showEway = !!eway?.ewbNo;
  const hasRight = showDelivery || showTransport || showEway;
  const contactLine = customer ? [customer.phone, customer.altPhone].filter(Boolean).join(', ') : '';

  return (
    <div className={`grid flex-none border-t ${CLEAN_RULE} ${hasRight ? 'grid-cols-2' : 'grid-cols-1'}`}>
      <div className="grid content-start gap-px px-2.5 py-2">
        <span className={CLEAN_LABEL}>Bill to</span>
        {customer ? (
          <>
            <span className="mb-px mt-0.5 text-[12px]">{customer.shopName || customer.name}</span>
            {customer.shopName && customer.name && customer.name !== customer.shopName && <span>{customer.name}</span>}
            {(customer.address || customer.pincode) && <span>{addressLine(customer.address, customer.pincode)}</span>}
            <span>
              State: {customer.state} ({gstStateCode(customer.state)}) · {customer.gstin ? `GSTIN: ${customer.gstin}` : 'Unregistered'}
            </span>
            {customer.fssaiNo && <span>FSSAI: {customer.fssaiNo}</span>}
            {(customer.contact || contactLine) && <span>{[customer.contact && `Contact: ${customer.contact}`, contactLine && `Phone: ${contactLine}`].filter(Boolean).join(' · ')}</span>}
          </>
        ) : (
          <span className={CLEAN_SOFT}>Select a customer to fill this in</span>
        )}
      </div>

      {hasRight && (
        <div className={`grid content-start gap-2 border-l ${CLEAN_RULE} px-2.5 py-2`}>
          {showDelivery && (
            <div className="grid gap-px">
              <span className={CLEAN_LABEL}>Delivery instructions</span>
              {editable ? <DeliveryInput {...p} /> : <span className="whitespace-pre-line">{deliveryInstructions}</span>}
            </div>
          )}
          {showTransport && (
            <div className="grid gap-px">
              <span className={CLEAN_LABEL}>Transport details</span>
              {editable ? (
                <TransportInputs {...p} />
              ) : (
                <>
                  {p.transportVehicleNo?.trim() && <span>Vehicle No: {p.transportVehicleNo}</span>}
                  {(p.transportDriverName?.trim() || p.transportDriverPhone?.trim()) && (
                    <span>{[p.transportDriverName?.trim() && `Driver: ${p.transportDriverName}`, p.transportDriverPhone?.trim()].filter(Boolean).join(' · ')}</span>
                  )}
                </>
              )}
            </div>
          )}
          {showEway && (
            <div className="grid gap-px">
              <span className={CLEAN_LABEL}>e-Way Bill</span>
              <span>{[`No. ${eway!.ewbNo}`, eway!.vehicleNo && `Vehicle ${eway!.vehicleNo}`].filter(Boolean).join(' · ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CleanItemsTable({ company, lines, editable, cols, onUpdateLine, onIncrement, onDecrement, onRemoveLine, startSerial, fillPx = 0 }: ItemsProps) {
  const base = startSerial ?? 0;
  const n = columnCount(cols);
  return (
    <div className={`flex-none overflow-x-auto border-t ${CLEAN_RULE} print:overflow-visible`}>
      <table className={`${CLEAN_ITEMS_TABLE} print:min-w-0 ${editable ? 'min-w-[680px]' : ''}`}>
        <thead>{theadRow(cols)}</thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={n} className={`${CLEAN_SOFT} py-6 text-center`}>
                No line items yet.
              </td>
            </tr>
          ) : (
            lines.map((l, i) => (
              <tr key={l.lineId}>{rowCells(l, base + i + 1, { ...cols, company, last: i === lines.length - 1 && !fillPx, onUpdateLine, onIncrement, onDecrement, onRemoveLine })}</tr>
            ))
          )}
          {fillPx > 0 && (
            <tr aria-hidden="true">
              {Array.from({ length: n }, (_, k) => (
                <td key={k} style={{ height: fillPx }} className={k > 0 ? `border-l ${CLEAN_RULE}` : ''} />
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CleanField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-px">
      <span className={CLEAN_LABEL}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** Quantity/words/bank/terms/notes (left) beside the totals ladder
 * (right), then the optional HSN breakup and the signature row. Each part
 * is `break-inside-avoid`, same overflow behaviour as CLASSIC. */
function CleanClosing(props: SharedProps) {
  const { company, lines, totals, ladder, editable, amountPaid, unitSummary, showHsn, notes } = props;
  const currency = company.currency;
  const paid = amountPaid && amountPaid > 0 ? amountPaid : 0;
  const showBank = !!(company.pdfShowBankDetails && company.bankName);
  const bank = [company.bankName, company.bankAcc && `A/c ${company.bankAcc}`, company.ifsc && `IFSC ${company.ifsc}`, company.branch, company.upi && `UPI ${company.upi}`].filter(Boolean).join(' · ');

  return (
    <div className="flex-none">
      <div className={`grid grid-cols-[minmax(0,1fr)_270px] border-t ${CLEAN_RULE} break-inside-avoid`}>
        <div className={`grid content-start gap-2 border-r ${CLEAN_RULE} px-2.5 py-2`}>
          {lines.length > 0 && <CleanField label="Total quantity">{unitSummary.map((r) => `${r.qty.toLocaleString('en-IN')} ${formatUnit(r.unit)}`).join(', ')}</CleanField>}
          <CleanField label="Amount in words">Rupees {numberToWords(totals.total)} Only</CleanField>
          {showBank && <CleanField label="Bank details">{bank}</CleanField>}
          {company.terms && (
            <CleanField label="Terms">
              <span className="whitespace-pre-line">{company.terms}</span>
            </CleanField>
          )}
          {(editable || notes) && <CleanField label="Notes">{editable ? <NotesInput {...props} /> : <span className="whitespace-pre-line">{notes}</span>}</CleanField>}
        </div>

        <table className="w-full self-start border-collapse text-[11px]">
          <tbody>
            {ladder.rows.map((row) => (
              <tr key={row.key} className={row.rule ? `border-t ${CLEAN_RULE}` : ''}>
                <td className="px-2.5 py-1">{row.label}</td>
                <td className="px-2.5 py-1 text-right">
                  {row.sign ?? ''}
                  {plainAmount(row.amount, currency)}
                </td>
              </tr>
            ))}
            {/* Bottom rule only when something follows — otherwise the
                section below draws that edge. */}
            <tr className={`${CLEAN_FILL} border-t ${CLEAN_RULE} ${paid ? `border-b ${CLEAN_RULE}` : ''} text-[14px]`}>
              <td className="px-2.5 py-[7px]">Total</td>
              <td className="px-2.5 py-[7px] text-right">{fmtInr(totals.total, currency)}</td>
            </tr>
            {paid > 0 && (
              <>
                <tr>
                  <td className="px-2.5 py-1">Paid</td>
                  <td className="px-2.5 py-1 text-right">−{plainAmount(paid, currency)}</td>
                </tr>
                <tr className="text-[12px]">
                  <td className="px-2.5 py-1">Balance due</td>
                  <td className="px-2.5 py-1 text-right">{fmtInr(totals.total - paid, currency)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {showHsn && <CleanHsnSummary {...props} />}

      <div className={`grid min-h-[78px] grid-cols-2 border-t ${CLEAN_RULE} break-inside-avoid`}>
        <div className="flex flex-col justify-between px-2.5 py-2">
          <span className={CLEAN_LABEL}>Receiver&apos;s signature</span>
          <span className={CLEAN_SOFT}>Name &amp; date</span>
        </div>
        <div className={`flex flex-col items-end justify-between gap-1 border-l ${CLEAN_RULE} px-2.5 py-2 text-right`}>
          <span>For {company.name}</span>
          {company.signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.signatureUrl}
              alt="Authorised signature"
              className="h-9 max-w-[160px] object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            company.signatoryName && <span>{company.signatoryName}</span>
          )}
          <span className={CLEAN_LABEL}>Authorised signatory</span>
        </div>
      </div>
    </div>
  );
}

/** HSN-wise tax breakup. Body rows rule their *top* edge (never the bottom)
 * so the darker rule above the Total row is never lost to a collapsed
 * lighter one. */
function CleanHsnSummary({ company, totals, hsnRows, hsnTotal }: SharedProps) {
  const currency = company.currency;
  const th = `${CLEAN_FILL} border-b ${CLEAN_RULE} px-2.5 py-1.5 text-[9px] uppercase tracking-[0.06em]`;
  const sep = `border-l ${CLEAN_RULE} text-right`;
  const td = 'px-2.5 py-1 text-right';
  const taxCells = (r: { cgstRate?: number; sgstRate?: number; igstRate?: number; cgstAmount: number; sgstAmount: number; igstAmount: number }, rates: boolean) =>
    totals.useIgst ? (
      <>
        <td className={`${td} ${sep}`}>{rates ? `${r.igstRate}%` : ''}</td>
        <td className={`${td} ${sep}`}>{plainAmount(r.igstAmount, currency)}</td>
      </>
    ) : (
      <>
        <td className={`${td} ${sep}`}>{rates ? `${r.cgstRate}%` : ''}</td>
        <td className={`${td} ${sep}`}>{plainAmount(r.cgstAmount, currency)}</td>
        <td className={`${td} ${sep}`}>{rates ? `${r.sgstRate}%` : ''}</td>
        <td className={`${td} ${sep}`}>{plainAmount(r.sgstAmount, currency)}</td>
      </>
    );

  return (
    <div className={`border-t ${CLEAN_RULE} break-inside-avoid`}>
      <table className="w-full border-collapse text-[10.5px]">
        <thead>
          <tr>
            <th className={`${th} text-left`}>HSN/SAC</th>
            <th className={`${th} ${sep}`}>Taxable value</th>
            {totals.useIgst ? (
              <>
                <th className={`${th} ${sep}`}>IGST rate</th>
                <th className={`${th} ${sep}`}>IGST</th>
              </>
            ) : (
              <>
                <th className={`${th} ${sep}`}>CGST rate</th>
                <th className={`${th} ${sep}`}>CGST</th>
                <th className={`${th} ${sep}`}>SGST rate</th>
                <th className={`${th} ${sep}`}>SGST</th>
              </>
            )}
            <th className={`${th} ${sep}`}>Total tax</th>
          </tr>
        </thead>
        <tbody>
          {hsnRows.map((r, i) => (
            <tr key={r.hsn} className={i > 0 ? `border-t ${CLEAN_ROW_RULE}` : ''}>
              <td className="px-2.5 py-1">{r.hsn}</td>
              <td className={`${td} ${sep}`}>{plainAmount(r.taxableValue, currency)}</td>
              {taxCells(r, true)}
              <td className={`${td} ${sep}`}>{plainAmount(r.totalTax, currency)}</td>
            </tr>
          ))}
          <tr className={`border-t ${CLEAN_RULE}`}>
            <td className="px-2.5 py-1">Total</td>
            <td className={`${td} ${sep}`}>{plainAmount(hsnTotal.taxableValue, currency)}</td>
            {taxCells(hsnTotal, false)}
            <td className={`${td} ${sep}`}>{plainAmount(hsnTotal.totalTax, currency)}</td>
          </tr>
        </tbody>
      </table>
      <div className={`border-t ${CLEAN_ROW_RULE} px-2.5 py-1.5`}>
        <span className={CLEAN_LABEL}>Tax amount in words</span>
        INR {amountToWordsWithPaise(hsnTotal.totalTax)} Only
      </div>
    </div>
  );
}
