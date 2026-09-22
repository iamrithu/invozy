'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import { computeTotals, computeHsnSummary, computeUnitSummary, fmtInr, formatInvoiceDate, formatUnit, DEFAULT_HSN } from '@/lib/gst';
import { numberToWords, amountToWordsWithPaise } from '@/lib/number-to-words';
import { gstStateCode } from '@/lib/gst-state-codes';
import { computeCapacities, paginateLines, useMeasuredSections, USABLE_MM, USABLE_PX } from './print-pagination';

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

/** The line-items table's header row — shared between the real table and
 * the hidden measurement probe (see useMeasuredSections below) so the
 * probe measures the exact same markup that actually gets printed. */
function classicTheadRow({ editable, hasAltQty, altUnitLabel }: { editable: boolean; hasAltQty: boolean; altUnitLabel: string }) {
  return (
    <tr className="border-y border-ink bg-surface-alt text-left font-semibold">
      <th className="w-9 border-r border-line px-2 py-1.5">S.NO</th>
      <th className="border-r border-line px-2 py-1.5">Products</th>
      <th className="w-[78px] border-r border-line px-2 py-1.5">HSN/SAC</th>
      <th className="w-[92px] border-r border-line px-2 py-1.5 text-right">Quantity</th>
      <th className="w-[76px] border-r border-line px-2 py-1.5 text-right">Rate</th>
      <th className="w-14 border-r border-line px-2 py-1.5 text-right">Per (Unit)</th>
      {editable && <th className="w-14 border-r border-line px-2 py-1.5 text-right">Disc%</th>}
      {hasAltQty && <th className="w-16 border-r border-line px-2 py-1.5 text-right">In {altUnitLabel}</th>}
      <th className="w-[100px] px-2 py-1.5 text-right">Amount</th>
      {editable && <th className="w-6 px-1" />}
    </tr>
  );
}

/** One item row's `<td>` cells — shared between the real table and the
 * measurement probe the same way classicTheadRow is. */
function classicRowCells(
  l: ClassicLine,
  serial: number,
  ctx: {
    company: ClassicCompany;
    editable: boolean;
    hasAltQty: boolean;
    onUpdateLine?: (lineId: string, patch: Partial<ClassicLine>) => void;
    onIncrement?: (lineId: string) => void;
    onDecrement?: (lineId: string) => void;
    onRemoveLine?: (lineId: string) => void;
  }
) {
  const { company, editable, hasAltQty, onUpdateLine, onIncrement, onDecrement, onRemoveLine } = ctx;
  const amount = l.qty * l.rate * (1 - l.discount / 100);
  const altQty = l.altUnit && l.altQtyPerUnit ? l.qty * l.altQtyPerUnit : null;
  return (
    <>
      <td className="border-r border-line px-2 py-1 align-top font-tabular">{serial}</td>
      <td className="border-r border-line px-2 py-1 align-top">{l.name}</td>
      <td className="border-r border-line px-2 py-1 align-top font-mono">
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
      <td className="border-r border-line px-2 py-1 text-right align-top">
        {editable ? (
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => onDecrement?.(l.lineId)} aria-label={`Decrease ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-sm2 border border-line">
              <Minus size={9} />
            </button>
            <span className="min-w-[24px] text-center font-mono font-tabular">
              {l.qty} {formatUnit(l.unit)}
            </span>
            <button onClick={() => onIncrement?.(l.lineId)} aria-label={`Increase ${l.name} quantity`} className="flex h-[18px] w-[18px] items-center justify-center rounded-sm2 border border-line">
              <Plus size={9} />
            </button>
          </div>
        ) : (
          <span className="font-mono font-tabular">
            {l.qty} {formatUnit(l.unit)}
          </span>
        )}
      </td>
      {/* Editable mode shows the raw rate (Disc% is a separate input right
          after it); print mode has no Disc% column at all, so it shows the
          discount already folded in — Rate × Qty then reads consistently
          with Amount. */}
      <td className="border-r border-line px-2 py-1 text-right align-top font-mono font-tabular">
        {fmtInr(editable ? l.rate : l.rate * (1 - l.discount / 100), company.currency)}
      </td>
      <td className="border-r border-line px-2 py-1 text-right align-top">{formatUnit(l.unit)}</td>
      {editable && (
        <td className="border-r border-line px-2 py-1 text-right align-top">
          <input
            type="number"
            min={0}
            max={100}
            step="1"
            value={l.discount}
            onChange={(e) => onUpdateLine?.(l.lineId, { discount: parseFloat(e.target.value) || 0 })}
            className="w-12 rounded-sm2 border border-line bg-surface px-1 py-0.5 text-right font-mono text-[10.5px] focus:border-brand focus:outline-none"
          />
        </td>
      )}
      {hasAltQty && (
        <td className="border-r border-line px-2 py-1 text-right align-top font-mono font-tabular">{altQty !== null ? altQty.toFixed(2).replace(/\.00$/, '') : ''}</td>
      )}
      <td className="px-2 py-1 text-right align-top font-mono font-tabular">{fmtInr(amount, company.currency)}</td>
      {editable && (
        <td className="px-1 py-1 align-top">
          <button onClick={() => onRemoveLine?.(l.lineId)} aria-label={`Remove ${l.name}`} className="flex h-[20px] w-[20px] items-center justify-center rounded-sm2 text-ink-faint hover:text-destructive">
            <Trash2 size={11} />
          </button>
        </td>
      )}
    </>
  );
}

/** The CLASSIC (Tally/ERP-style) GST tax invoice — a distinct layout from
 * InvoiceSheet, selected per-Company via Company.invoiceTemplate. Mirrors a
 * real dairy-distributor tax invoice: IRN/QR + Ack block, buyer FSSAI/
 * contact, HSN/SAC item table (with per-line and overall discount, and an
 * optional secondary-quantity column), HSN-wise tax summary with its own
 * "Tax Amount (in words)" line, Bank Details/Terms (from Company settings),
 * declaration, and a Customer's Sign / Authorised Signatory row. See
 * invoice-eway-bill-sheet.tsx for the companion printed e-Way Bill page.
 *
 * `editable` never gets printed directly (the builder's preview dialog and
 * print-only copy both instantiate a separate editable={false} element), so
 * it stays a single continuous flow — no pagination, no print-specific
 * layout tricks, just the plain editing UI. Only the editable={false} render
 * path below deals with physical pages at all. */
export function InvoiceSheetClassic(props: {
  company: ClassicCompany;
  customer: ClassicCustomer | null;
  date: string;
  invoiceNumber?: string;
  lines: ClassicLine[];
  totals: ReturnType<typeof computeTotals>;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  /** When true, the discount % box broadcasts to every line's own discount
   * field instead of being a single reduction applied once at invoice
   * level — see builder-client.tsx's handling for how the two stay
   * mutually exclusive (never double-discounting the same amount). */
  applyPerItem?: boolean;
  irn?: string | null;
  ackNo?: string | null;
  ackDate?: string | null;
  qrImageDataUrl?: string | null;
  /** Company-level "Show a scannable UPI QR" setting, rendered above the
   * Authorised Signatory block — see src/lib/qr.ts's upiQrDataUrl().
   * Independent of gpayNumber below — either, both, or neither can be set. */
  upiQrDataUrl?: string | null;
  /** Company-level "Show GPay number" setting — this company's own phone
   * number, printed as a GPay-reachable number above the signatory block. */
  gpayNumber?: string | null;
  eway?: ClassicEway | null;
  /** Sum of Payment rows recorded against this invoice — shown as a
   * Paid/Balance line right under the total when there's a partial or full
   * payment on file. Omitted (or 0) shows nothing, same as before this
   * prop existed. */
  amountPaid?: number;
  /** Per-invoice remarks (distinct from Company.terms, which is identical on
   * every invoice) — printed near the totals/declaration on the last page. */
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
  onDiscountTypeChange?: (t: 'PERCENT' | 'FLAT') => void;
  onDiscountValueChange?: (v: number) => void;
  onApplyPerItemChange?: (v: boolean) => void;
  onNotesChange?: (v: string) => void;
  onDeliveryInstructionsChange?: (v: string) => void;
  onTransportVehicleNoChange?: (v: string) => void;
  onTransportDriverNameChange?: (v: string) => void;
  onTransportDriverPhoneChange?: (v: string) => void;
}) {
  const { company, customer, lines, totals, discountType, discountValue, editable } = props;

  const hsnRows = customer
    ? computeHsnSummary(
        lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount, hsn: l.hsn })),
        { type: discountType, value: discountValue },
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
  // Whether this invoice actually charges any GST — checked against the
  // computed tax amounts (not just the enabled toggles) so a tax that's
  // switched on but rated at 0% is treated the same as one switched off:
  // either way there's nothing real to show, and a row/column of "0%" /
  // ₹0.00 reads as broken rather than as "no tax applies here".
  const gstEnabled = totals.cgst > 0 || totals.sgst > 0 || totals.igst > 0;
  const showHsn = !!(company.pdfShowHsnSummary && gstEnabled && hsnRows.length > 0);
  const shared = { ...props, hsnRows, hsnTotal, unitSummary, hasAltQty, altUnitLabel, showHsn, gstEnabled };

  // The longest name in the invoice, not just the first line, gives the
  // measurement probe a more conservative (safer) row-height reading —
  // a rare unusually-long product name shouldn't be able to skew the
  // split if it happens to land anywhere other than line 1.
  const measureLine =
    lines.length > 0
      ? lines.reduce((longest, l) => (l.name.length > longest.name.length ? l : longest), lines[0])
      : ({ lineId: '__measure__', name: 'Representative Item Name', unit: 'pcs', qty: 1, rate: 0, discount: 0 } satisfies ClassicLine);

  // Called unconditionally (rules of hooks) even in editable mode, where
  // its result is simply unused — every real call site passes a fixed,
  // never-toggled `editable` prop, but keeping the hook call itself
  // unconditional avoids relying on that.
  const { heights, ready, probe } = useMeasuredSections({
    header: <ClassicHeader {...shared} />,
    buyer: <ClassicBuyerRow {...shared} />,
    itemsTableHead: classicTheadRow({ editable: false, hasAltQty, altUnitLabel }),
    itemRow: classicRowCells(measureLine, 1, { company, editable: false, hasAltQty }),
    continuedFooter: <div className="flex justify-end border-t border-ink p-2 text-[10.5px] font-bold text-ink-soft">Continued on Page 2 of 3 →</div>,
    closing: <ClassicClosing {...shared} />,
  });

  if (editable) {
    return (
      <div className="rounded-b-lg2 border border-t-0 border-line bg-white p-5 text-[11.5px] leading-normal text-ink-body shadow-card">
        <div className="border border-ink">
          <ClassicHeader {...shared} />
          <ClassicBuyerRow {...shared} />
          <ClassicItemsTable {...shared} />
          <ClassicClosing {...shared} />
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
  const { pages } = capacities ? paginateLines(lines, capacities.perPage, capacities.singleCap, capacities.lastCap) : { pages: [] };
  let serial = 0;

  return (
    <div className="relative rounded-b-lg2 border border-t-0 border-line bg-white p-5 text-[11.5px] leading-normal text-ink-body shadow-card print:rounded-none print:border-none print:p-0 print:shadow-none">
      {probe}
      {/* Tells the PDF route's Playwright navigation the corrected,
          measured-and-paginated layout has committed — see route.ts's
          waitForSelector call. Only set once real pages exist — see the
          comment on the equivalent spot in invoice-sheet.tsx. */}
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
        // Explicit pixel height for the spacer below, computed from the same
        // measured heights this page's row/column split was already
        // computed from — rather than a `flex: 1` spacer growing into a
        // `min-height` on its flex container. See the isLast-only rationale
        // below for why only the last page gets one at all.
        const lastPageSpacerPx =
          isLast && heights
            ? Math.max(0, USABLE_PX - (heights.header + (showBuyer ? heights.buyer : 0) + heights.thead + pageLines.length * heights.row + heights.closing))
            : 0;
        return (
          <div key={i} className={`invoice-page flex flex-col ${i > 0 ? 'mt-6 print:mt-0' : ''} ${!isLast ? 'print:break-after-page ' : ''}`}>

            {/* print:min-h anchors this box to (a safety-margined) full page
                height so the fixed-height spacer below always sums with the
                rest of this page's content to that same height — pushing
                the closing block down to sit flush against the bottom of
                the page instead of floating right under the items table
                with a big blank gap under it. Deliberately ONLY on the last
                page: a continuation page has no closing block to anchor,
                just a one-line "Continued on Page N" strip — stretching
                that page to full height too would drag the strip down and
                leave a large, clearly-visible empty gap inside the bordered
                box above it. */}
            <div
              className="invoice-page-inner flex flex-1 flex-col border border-ink"
              style={isLast ? { minHeight: `${USABLE_MM}mm` } : undefined}
            >
              <ClassicHeader {...shared} />
              {showBuyer && <ClassicBuyerRow {...shared} />}
              {pageLines.length > 0 && <ClassicItemsTable {...shared} lines={pageLines} startSerial={startSerial} />}
              {isLast && lastPageSpacerPx > 0 && <div className="flex-none" style={{ height: `${lastPageSpacerPx}px` }} />}
              {isLast ? (
                <ClassicClosing {...shared} />
              ) : (
                <div className="flex justify-end border-t border-ink p-2 text-[10.5px] font-bold text-ink-soft">
                  Continued on Page {i + 2} of {pages.length} →
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type SharedProps = ReturnType<typeof buildSharedPropsType>;
// Purely a type helper — never called. Keeps the sub-components' prop types
// in sync with InvoiceSheetClassic's own props + the derived values it
// computes once, without re-declaring every field by hand.
function buildSharedPropsType() {
  return {} as Parameters<typeof InvoiceSheetClassic>[0] & {
    hsnRows: ReturnType<typeof computeHsnSummary>;
    hsnTotal: { taxableValue: number; cgstAmount: number; sgstAmount: number; igstAmount: number; totalTax: number };
    unitSummary: ReturnType<typeof computeUnitSummary>;
    hasAltQty: boolean;
    altUnitLabel: string;
    showHsn: boolean;
    gstEnabled: boolean;
  };
}

/** Letterhead: logo, company details, invoice No./Date — identical markup
 * rendered fresh on every physical page (see the pagination note above for
 * why this isn't a repeating <thead> instead). Table/table-cell layout, not
 * flexbox, purely for print-safety consistency with the rest of the sheet. */
function ClassicHeader({ company, invoiceNumber, date }: SharedProps) {
  return (
    <div className="flex-none">
      <div className="border-b border-ink bg-surface-alt py-1.5 text-center text-[13px] font-extrabold uppercase tracking-wide text-ink">Tax Invoice</div>
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
                  <div className="text-[14.5px] font-extrabold tracking-tight text-ink">{company.name}</div>
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
              <div className="text-[9.5px] font-bold uppercase tracking-wide text-ink-faint">Invoice No.</div>
              {/* No number exists yet in the builder's live preview — the
                  real one is only claimed from the sequential counter on
                  Save (see createInvoice), so this never shows a
                  workflow-status word like "Draft" on a customer-facing PDF. */}
              <div className="font-mono font-tabular text-[17px] font-extrabold text-ink">{invoiceNumber ?? '—'}</div>
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

/** Buyer details + delivery instructions (left) and e-Invoice QR/e-Way Bill
 * refs (right) — same repeat-per-page treatment as the letterhead above. */
function ClassicBuyerRow({
  customer,
  deliveryInstructions,
  editable,
  onDeliveryInstructionsChange,
  irn,
  ackNo,
  ackDate,
  qrImageDataUrl,
  eway,
  showTransportDetails,
  transportVehicleNo,
  transportDriverName,
  transportDriverPhone,
  onTransportVehicleNoChange,
  onTransportDriverNameChange,
  onTransportDriverPhoneChange,
}: SharedProps) {
  const hasTransportDetails = !!(transportVehicleNo?.trim() || transportDriverName?.trim() || transportDriverPhone?.trim());
  return (
    <table className="w-full flex-none border-b border-ink">
      <tbody>
        <tr>
          <td className="min-w-[260px] border-r border-line p-1.5 align-top leading-snug">
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
          <td className="p-1.5 text-right align-top">
            {/* Opt-in, unlike the Delivery Instructions box below it — only
                appears once "Show on invoice PDF" is turned on for this
                invoice (see the builder's Settings sheet), and even then
                only prints once at least one of the three fields actually
                has something in it, so turning the setting on with nothing
                entered yet doesn't leave an empty box on the PDF. */}
            {showTransportDetails && (editable || hasTransportDetails) && (
              <div className="mb-1.5 rounded-sm2 border border-dashed border-line p-1.5 text-left">
                <div className="text-[9px] font-bold uppercase tracking-wide text-ink-faint">Transport Details</div>
                {editable ? (
                  <div className="mt-0.5 space-y-1">
                    <input
                      value={transportVehicleNo ?? ''}
                      onChange={(e) => onTransportVehicleNoChange?.(e.target.value)}
                      placeholder="Vehicle number"
                      className="w-full rounded-sm2 border border-line bg-surface px-1.5 py-1 text-[10.5px] focus:border-brand focus:outline-none"
                    />
                    <input
                      value={transportDriverName ?? ''}
                      onChange={(e) => onTransportDriverNameChange?.(e.target.value)}
                      placeholder="Driver name"
                      className="w-full rounded-sm2 border border-line bg-surface px-1.5 py-1 text-[10.5px] focus:border-brand focus:outline-none"
                    />
                    <input
                      value={transportDriverPhone ?? ''}
                      onChange={(e) => onTransportDriverPhoneChange?.(e.target.value)}
                      placeholder="Driver contact number"
                      className="w-full rounded-sm2 border border-line bg-surface px-1.5 py-1 text-[10.5px] focus:border-brand focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="mt-0.5 space-y-0.5 text-[10px]">
                    {transportVehicleNo?.trim() && (
                      <div>
                        Vehicle No. : <span className="font-mono font-tabular">{transportVehicleNo}</span>
                      </div>
                    )}
                    {transportDriverName?.trim() && <div>Driver : {transportDriverName}</div>}
                    {transportDriverPhone?.trim() && (
                      <div>
                        Driver Contact : <span className="font-mono font-tabular">{transportDriverPhone}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Fixed, always-visible box (not gated on having content) so
                its position is predictable invoice to invoice — a delivery
                crew (or the person filling this in) always finds it in the
                same place, right of the buyer details, rather than only
                when non-empty. This does cost real space on every invoice
                that doesn't use it (see the pagination note in
                InvoiceSheetClassic above), a deliberate tradeoff for that
                predictability. */}
            <div className="mb-1.5 rounded-sm2 border border-dashed border-line p-1.5 text-left">
              <div className="text-[9px] font-bold uppercase tracking-wide text-ink-faint">Delivery Instructions</div>
              {editable ? (
                <textarea
                  value={deliveryInstructions ?? ''}
                  onChange={(e) => onDeliveryInstructionsChange?.(e.target.value)}
                  placeholder="e.g. Deliver before 10 AM via rear gate, call security on arrival"
                  rows={2}
                  className="mt-0.5 w-full resize-none rounded-sm2 border border-line bg-surface px-1.5 py-1 text-[10.5px] focus:border-brand focus:outline-none"
                />
              ) : (
                <div className="mt-0.5 min-h-[10px] whitespace-pre-line text-[10px]">{deliveryInstructions || '—'}</div>
              )}
            </div>
            {irn ? (
              <>
                {qrImageDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrImageDataUrl} alt="e-Invoice QR" className="ml-auto h-[90px] w-[90px]" />
                )}
                <div className="mt-1 font-bold uppercase tracking-wide text-ink-faint">e-Invoice</div>
                <div className="ml-auto max-w-[220px] break-all font-mono text-[10px]">IRN : {irn}</div>
                {ackNo && <div className="font-tabular">Ack No. : {ackNo}</div>}
                {ackDate && <div className="font-tabular">Ack Date : {formatInvoiceDate(ackDate)}</div>}
              </>
            ) : (
              <div className="ml-auto inline-block rounded-sm2 border border-dashed border-line px-3 py-2 text-[10.5px] text-ink-faint print:hidden">e-Invoice not generated yet</div>
            )}
            {(eway?.ewbNo || eway?.vehicleNo) && (
              <div className="mt-2 space-y-0.5 border-t border-dashed border-line pt-1.5 text-left">
                {eway?.ewbNo && <Row k="e-Way Bill No." v={eway.ewbNo} mono />}
                {eway?.vehicleNo && <Row k="Vehicle No." v={eway.vehicleNo} mono />}
              </div>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** The line-items grid. Print mode takes a `lines`/`startSerial` slice for
 * just this physical page; editable mode always gets the whole list (never
 * paginated — see the component doc comment). */
function ClassicItemsTable({ company, lines, editable, hasAltQty, altUnitLabel, onUpdateLine, onIncrement, onDecrement, onRemoveLine, startSerial }: SharedProps & { startSerial?: number }) {
  const base = startSerial ?? 0;
  return (
    <div className="flex-none overflow-x-auto print:overflow-visible">
      <table className={`w-full border-collapse text-[11px] print:min-w-0 ${editable ? 'min-w-[720px]' : 'min-w-[640px]'}`}>
        <thead>{classicTheadRow({ editable, hasAltQty, altUnitLabel })}</thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={7 + (hasAltQty ? 1 : 0) + (editable ? 2 : 0)} className="py-6 text-center text-ink-faint">
                No line items yet.
              </td>
            </tr>
          ) : (
            lines.map((l, i) => (
              <tr key={l.lineId} className="border-b border-line">
                {classicRowCells(l, base + i + 1, { company, editable, hasAltQty, onUpdateLine, onIncrement, onDecrement, onRemoveLine })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Totals ladder, amounts-in-words, HSN breakup, bank/terms, notes,
 * declaration and signatures — computed once from the *whole* invoice
 * (never a per-page slice) and rendered exactly once: inline after the
 * items table in editable mode, or on the final physical page in print
 * mode (the caller only mounts this on the last page — see
 * InvoiceSheetClassic above). */
function ClassicClosing(props: SharedProps) {
  const {
    company,
    lines,
    totals,
    discountType,
    discountValue,
    applyPerItem,
    editable,
    onDiscountTypeChange,
    onDiscountValueChange,
    onApplyPerItemChange,
    amountPaid,
    unitSummary,
    showHsn,
    hsnRows,
    hsnTotal,
    notes,
    onNotesChange,
    gstEnabled,
  } = props;
  const footTdColSpan = (editable ? 7 : 6) + (props.hasAltQty ? 1 : 0);

  return (
    <div className="flex-none">
      <table className="w-full border-collapse border-t border-ink text-[11px]">
        <tfoot>
          <tr>
            <td colSpan={footTdColSpan} className="px-2.5 py-1 text-right font-bold">
              Subtotal
            </td>
            <td className="px-2.5 py-1 text-right font-mono font-tabular">{fmtInr(totals.subtotal, company.currency)}</td>
            {editable && <td />}
          </tr>
          {totals.overallDiscountAmount > 0 && (
            <tr>
              <td colSpan={footTdColSpan} className="px-2.5 py-1 text-right font-bold">
                Discount
              </td>
              <td className="px-2.5 py-1 text-right font-mono font-tabular">−{fmtInr(totals.overallDiscountAmount, company.currency)}</td>
              {editable && <td />}
            </tr>
          )}
          {gstEnabled && (
            <tr>
              <td colSpan={footTdColSpan} className="px-2.5 py-1 text-right font-bold">
                {totals.useIgst ? (
                  'Outward IGST'
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span>Outward CGST</span>
                    <span>Outward SGST</span>
                  </div>
                )}
              </td>
              <td className="px-2.5 py-1 text-right font-mono font-tabular">
                {totals.useIgst ? (
                  fmtInr(totals.igst, company.currency)
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span>{fmtInr(totals.cgst, company.currency)}</span>
                    <span>{fmtInr(totals.sgst, company.currency)}</span>
                  </div>
                )}
              </td>
              {editable && <td />}
            </tr>
          )}
          <tr>
            <td colSpan={footTdColSpan} className="px-2.5 py-1 text-right font-bold">
              Rounding Off
            </td>
            <td className="px-2.5 py-1 text-right font-mono font-tabular">{`${totals.roundOff >= 0 ? '+' : ''}${fmtInr(totals.roundOff, company.currency)}`}</td>
            {editable && <td />}
          </tr>
          <tr className="border-t-2 border-ink bg-surface-alt">
            <td colSpan={footTdColSpan} className="px-2.5 py-1.5 text-right text-[13px] font-extrabold">
              Total
            </td>
            <td className="px-2.5 py-1.5 text-right font-mono font-tabular text-[13px] font-extrabold">{fmtInr(totals.total, company.currency)}</td>
            {editable && <td />}
          </tr>
        </tfoot>
      </table>

      {editable && (
        <div className="flex flex-col gap-1.5 border-t border-dashed border-line px-2.5 py-2 print:hidden">
          <div className="flex items-center gap-2.5 text-[12px] font-bold text-ink-soft">
            <span>{applyPerItem ? 'Discount per item' : 'Overall discount'}</span>
            <div className="flex rounded-sm2 bg-bg p-0.5">
              <button
                type="button"
                onClick={() => onDiscountTypeChange?.('PERCENT')}
                aria-label="Percent discount"
                className={`rounded-sm2 px-3 py-1 text-[11px] font-extrabold ${discountType === 'PERCENT' ? 'bg-brand text-white' : 'text-ink-faint'}`}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => onDiscountTypeChange?.('FLAT')}
                disabled={applyPerItem}
                aria-label="Flat rupee discount"
                className={`rounded-sm2 px-3 py-1 text-[11px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40 ${discountType === 'FLAT' ? 'bg-brand text-white' : 'text-ink-faint'}`}
              >
                ₹
              </button>
            </div>
            <input
              type="number"
              min={0}
              step="0.5"
              value={discountValue}
              onChange={(e) => onDiscountValueChange?.(parseFloat(e.target.value) || 0)}
              className="ml-auto w-20 rounded-sm2 border border-line bg-surface px-2 py-1 text-right font-mono text-[12.5px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-faint">
            <input
              type="checkbox"
              checked={!!applyPerItem}
              onChange={(e) => onApplyPerItemChange?.(e.target.checked)}
              className="h-3.5 w-3.5 rounded-sm2 border-line accent-brand"
            />
            Apply this % to every line item instead of one overall reduction
          </label>
        </div>
      )}

      <div className="border-t border-line p-1.5 break-inside-avoid">
        <span className="font-bold">Amount Chargeable (in words) : </span>
        INR {numberToWords(totals.total)} Only
      </div>

      {lines.length > 0 && (
        <div className="border-t border-line p-1.5 break-inside-avoid">
          <span className="font-bold">Total Quantity : </span>
          {unitSummary.map((r) => `${r.qty.toLocaleString('en-IN')} ${formatUnit(r.unit)}`).join(', ')}
        </div>
      )}

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
                <tr className="border-t-2 border-ink bg-surface-alt font-bold">
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

      {((company.pdfShowBankDetails && company.bankName) || company.terms || props.upiQrDataUrl || props.gpayNumber) && (
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
          {(props.upiQrDataUrl || props.gpayNumber) && (
            <div className="flex flex-none gap-4 text-center text-[9.5px]">
              {props.upiQrDataUrl && (
                <div className="flex flex-col items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={props.upiQrDataUrl} alt="Scan to pay via UPI" className="h-[70px] w-[70px]" />
                  <div className="mt-0.5 font-bold uppercase tracking-wide text-ink-faint">Scan to pay via UPI</div>
                </div>
              )}
              {props.gpayNumber && (
                <div className="flex flex-col items-center justify-center">
                  <div className="font-bold uppercase tracking-wide text-ink-faint">Pay via GPay</div>
                  <div className="font-mono text-[13px] font-extrabold text-ink">{props.gpayNumber}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(editable || notes) && (
        <div className="border-t border-line p-1.5 break-inside-avoid">
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Notes</div>
          {editable ? (
            <textarea
              value={notes ?? ''}
              onChange={(e) => onNotesChange?.(e.target.value)}
              placeholder="Any remarks specific to this invoice…"
              rows={2}
              className="w-full resize-none rounded-sm2 border border-line bg-surface px-1.5 py-1 text-[10.5px] focus:border-brand focus:outline-none"
            />
          ) : (
            notes && <p className="whitespace-pre-line leading-snug text-ink-soft">{notes}</p>
          )}
        </div>
      )}

      <div className="border-t border-line p-1.5 text-[10.5px] leading-snug text-ink-soft break-inside-avoid">
        <div className="mb-0.5 font-bold text-ink">Declaration</div>
        We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. We hereby certify that the goods mentioned in this invoice are
        warranted to be of the nature and quality purported to be.
      </div>

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
