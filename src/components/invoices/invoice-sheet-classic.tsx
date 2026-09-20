import { Minus, Plus, Trash2 } from 'lucide-react';
import { computeTotals, computeHsnSummary, computeUnitSummary, fmtInr, formatInvoiceDate, formatUnit, DEFAULT_HSN } from '@/lib/gst';
import { numberToWords, amountToWordsWithPaise } from '@/lib/number-to-words';
import { gstStateCode } from '@/lib/gst-state-codes';

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
// The old approach wrapped the whole document in one outer <table> and
// relied on the browser repeating its <thead> on every physical page — the
// same trick that legitimately makes a data table's column headers repeat.
// That works right up until the header's own content (letterhead + buyer +
// delivery instructions) crosses roughly 190-200px of height, at which point
// Chromium's print pipeline (both Playwright's page.pdf() and the browser's
// own interactive print preview — verified separately) silently stops
// repeating it: it prints once on page 1 and never again, often leaving the
// remaining content to collapse onto a near-empty subsequent page. That's
// not a config knob to tune; it's a hard ceiling, and any company with a
// normal address + FSSAI + a customer with a delivery note sails past it.
//
// The fix is to stop asking the browser to repeat anything. Instead, once
// there's more than one physical page's worth of line items, this component
// pre-splits them into explicit page-sized chunks itself and renders the
// header block fresh, as ordinary duplicated markup, at the top of every
// chunk. Nothing here depends on <thead>/<tfoot> repeat semantics, so there
// is no height ceiling to hit.
// ---------------------------------------------------------------------------

// Row/section budgets for A4 at the 14mm/12mm margins the PDF route already
// prints with (269mm usable height per page) — measured directly
// (getBoundingClientRect, in an actual print-emulated render) after the
// header/buyer/closing blocks were tightened (combined GSTIN+state onto one
// line, dropped the empty Delivery Instructions placeholder box, smaller
// fonts, less padding throughout): header 26.4mm, buyer block 23.1mm, item
// table header 11.0mm, each item row 6.75mm. Rounded up a little from the
// raw measurement for headroom — a company with a longer wrapped address
// isn't what pushes a page over. A ~6mm safety margin is additionally
// subtracted from 269mm before dividing by row height.
const USABLE_MM = 263;
const HEADER_MM = 32;
const BUYER_MM = 26;
const ITEM_THEAD_MM = 11;
const ITEM_ROW_MM = 7.5;
const CONTINUED_FOOTER_MM = 9;
const ENDBAND_MM = 5;

// The closing block (totals ladder + amount-in-words + qty summary +
// optional HSN table + optional bank/terms + optional notes + optional
// paid/balance + declaration + signature) varies a lot by company: one
// without bank details or notes is genuinely ~50mm shorter than one with
// both. A single fixed "worst case" constant was tried first and works, but
// wastes real pages for the (common) leaner case — e.g. 24 items came out
// to 4 pages, most of them nearly empty, purely because the budget assumed
// bank+notes that this particular company doesn't even show. Each
// contribution below is its own isolated measurement (same technique:
// render the same invoice with just that one section toggled, diff the
// closing block's height), summed only for the sections THIS invoice
// actually renders. Re-measured after the same padding/font tightening as
// the header/buyer above — also caught two constants (discount row, paid
// box) that were under-budgeted even before that redesign.
const CLOSING_BASE_MM = 93; // totals ladder + words + qty summary + declaration + signature, nothing optional
const CLOSING_BANK_MM = 28;
const CLOSING_TERMS_MM = 13;
const CLOSING_NOTES_MM = 13;
const CLOSING_HSN_MM = 29; // the HSN/SAC breakup table + its own "Tax Amount (in words)" line
const CLOSING_DISCOUNT_ROW_MM = 7; // one extra row in the totals ladder when an overall discount applies
const CLOSING_PAID_MM = 16; // the Paid/Balance due box, when a payment is on file

function estimateClosingHeightMm(p: {
  company: ClassicCompany;
  totals: ReturnType<typeof computeTotals>;
  notes?: string | null;
  amountPaid?: number;
  showHsn: boolean;
}) {
  let mm = CLOSING_BASE_MM;
  const showBank = !!(p.company.pdfShowBankDetails && p.company.bankName);
  const showTerms = !!p.company.terms;
  // Bank and terms share one grid row (see ClassicClosing) rather than
  // stacking, so showing both only costs as much as the taller of the two.
  if (showBank || showTerms) mm += Math.max(showBank ? CLOSING_BANK_MM : 0, showTerms ? CLOSING_TERMS_MM : 0);
  if (p.notes) mm += CLOSING_NOTES_MM;
  if (p.showHsn) mm += CLOSING_HSN_MM;
  if (p.totals.overallDiscountAmount > 0) mm += CLOSING_DISCOUNT_ROW_MM;
  if (p.amountPaid && p.amountPaid > 0) mm += CLOSING_PAID_MM;
  return mm;
}

const ITEMS_PER_MIDDLE_PAGE = Math.floor((USABLE_MM - HEADER_MM - BUYER_MM - ITEM_THEAD_MM - CONTINUED_FOOTER_MM) / ITEM_ROW_MM);
/** How many items fit on the true final page of a *multi-page* invoice,
 * where the buyer block is dropped (see the render logic below) — so it's
 * just header + items + closing. */
function lastPageCapacity(closingMm: number) {
  return Math.max(0, Math.floor((USABLE_MM - HEADER_MM - ITEM_THEAD_MM - closingMm - ENDBAND_MM) / ITEM_ROW_MM));
}
/** How many items a genuinely *single-page* invoice can have — header,
 * buyer, items AND the full closing block all on the one page that exists. */
function singlePageCapacity(closingMm: number) {
  return Math.max(0, Math.floor((USABLE_MM - HEADER_MM - BUYER_MM - ITEM_THEAD_MM - closingMm - ENDBAND_MM) / ITEM_ROW_MM));
}

/** Splits line items into physical pages. A short invoice that fits — header
 * + buyer + every item + the full closing block, all together — stays the
 * single page it always was. Otherwise every page but the last is filled to
 * at most `perPage`, and the last page (which drops the repeating buyer
 * block — see the render logic below) is capped at `lastCap` so there's
 * always room left for the totals/HSN/signature block that only ever
 * appears once.
 *
 * Item counts are balanced evenly across pages rather than maxing out the
 * last page's capacity first. Greedily filling the last page would, for a
 * small invoice that only needs 2 pages because the buyer block doesn't
 * also fit alongside the items (e.g. 6-10 items), strand nearly everything
 * on page 2 and leave page 1 with a single near-blank line — which looks
 * exactly as broken as the wasted-page bug this pagination replaced. */
function paginateLines<T>(lines: T[], perPage: number, singleCap: number, lastCap: number): T[][] {
  const total = lines.length;
  if (total <= singleCap) return [lines];

  // Minimum number of item-only ("non-last") pages needed given the last
  // page can absorb at most `lastCap` — always at least 1, so the result is
  // never fewer than 2 pages total (see paginateLines doc comment above).
  const nonLastPageCount = Math.max(1, Math.ceil((total - lastCap) / perPage));
  const pageCount = nonLastPageCount + 1;

  const idealShare = total / pageCount;
  const lastCount = lastCap <= 0 ? 0 : Math.min(lastCap, Math.max(1, Math.round(idealShare)));
  const nonLastTotal = total - lastCount;
  const base = Math.floor(nonLastTotal / nonLastPageCount);
  const extra = nonLastTotal % nonLastPageCount;

  const pages: T[][] = [];
  let idx = 0;
  for (let i = 0; i < nonLastPageCount; i++) {
    const take = Math.min(perPage, base + (i < extra ? 1 : 0));
    pages.push(lines.slice(idx, idx + take));
    idx += take;
  }
  pages.push(lines.slice(idx));
  return pages;
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
        customer.state
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
  const showHsn = !!(company.pdfShowHsnSummary && hsnRows.length > 0);
  const shared = { ...props, hsnRows, hsnTotal, unitSummary, hasAltQty, altUnitLabel, showHsn };

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

  const closingMm = estimateClosingHeightMm({ company, totals, notes: props.notes, amountPaid: props.amountPaid, showHsn });
  // Computed once, explicitly — *not* inferred from pages.length === 1 later
  // on, which paginateLines can also produce by coincidence (whenever total
  // <= lastCap, its own tail-reservation logic collapses to one page too,
  // but one sized on the assumption that the buyer block is NOT shown).
  // Conflating the two would render that page with the buyer block anyway.
  const isTrueSinglePage = lines.length <= singlePageCapacity(closingMm);
  const pages = paginateLines(lines, ITEMS_PER_MIDDLE_PAGE, singlePageCapacity(closingMm), lastPageCapacity(closingMm));
  let serial = 0;

  return (
    <div className="rounded-b-lg2 border border-t-0 border-line bg-white p-5 text-[11.5px] leading-normal text-ink-body shadow-card print:rounded-none print:border-none print:p-0 print:shadow-none">
      {pages.map((pageLines, i) => {
        const startSerial = serial;
        serial += pageLines.length;
        const isLast = i === pages.length - 1;
        return (
          <div key={i} className={`invoice-page flex flex-col ${i > 0 ? 'mt-6 print:mt-0' : ''} ${!isLast ? 'print:break-after-page' : ''}`}>
            <div className="invoice-page-inner flex flex-1 flex-col border border-ink">
              <ClassicHeader {...shared} />
              {/* The closing block (totals + amount-in-words + qty summary
                  + optional HSN table + bank/terms + notes + declaration +
                  signature) is tall enough on its own that repeating the
                  buyer block too, on a genuinely multi-page invoice's final
                  page, was tested empirically to overflow — buyer info
                  already appeared on every earlier page that had items, so
                  it's dropped here (not the letterhead, which still
                  identifies the invoice) to make room. A true single-page
                  invoice always keeps it — there's nothing to have shown it
                  earlier in that case. */}
              {(!isLast || isTrueSinglePage) && <ClassicBuyerRow {...shared} />}
              {pageLines.length > 0 && <ClassicItemsTable {...shared} lines={pageLines} startSerial={startSerial} />}
              {isLast ? (
                <>
                  <ClassicClosing {...shared} />
                  {/* Inside the same height-bounded box as everything else
                      on this page, not a sibling after it — a box already
                      sized to exactly one page's height (see
                      .invoice-page-inner) plus so much as one more line
                      below it is enough to spill a whole extra, otherwise
                      blank, page. */}
                  <div className="pt-1 text-center text-[9.5px] text-ink-faint">This is a Computer Generated Invoice — End of Invoice</div>
                </>
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
  };
}

/** Letterhead: logo, company details, invoice No./Date — identical markup
 * rendered fresh on every physical page (see the pagination note above for
 * why this isn't a repeating <thead> instead). Table/table-cell layout, not
 * flexbox, purely for print-safety consistency with the rest of the sheet. */
function ClassicHeader({ company, invoiceNumber, date }: SharedProps) {
  return (
    <div className="flex-none">
      <div className="border-b border-ink bg-surface-alt py-1 text-center text-[12px] font-extrabold uppercase tracking-wide text-ink">Tax Invoice</div>
      <table className="w-full border-b border-ink">
        <tbody>
          <tr>
            {/* Fixed 65% width (not max-width, which table cells only treat
                as a hint under auto table-layout) so the address/GSTIN text
                reliably wraps inside its own column instead of running past
                it toward the invoice-number cell for a longer address. */}
            <td className="w-[65%] p-1.5 align-top">
              <div className="flex items-start gap-2">
                {company.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={company.logoUrl} alt="" className="h-10 w-10 flex-none rounded-sm2 border border-line object-contain" />
                )}
                <div className="min-w-0 leading-snug">
                  <div className="text-[13px] font-extrabold tracking-tight text-ink">{company.name}</div>
                  {company.address && <div className="whitespace-pre-line text-[10px] leading-tight">{company.address}</div>}
                  <div className="mt-0.5 text-[10px]">
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
                    <div className="text-[10px]">
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
            <td className="w-[35%] p-1.5 text-right align-top">
              <div className="text-[9px] font-bold uppercase tracking-wide text-ink-faint">Invoice No.</div>
              {/* No number exists yet in the builder's live preview — the
                  real one is only claimed from the sequential counter on
                  Save (see createInvoice), so this never shows a
                  workflow-status word like "Draft" on a customer-facing PDF. */}
              <div className="font-mono font-tabular text-[15px] font-extrabold text-ink">{invoiceNumber ?? '—'}</div>
              <div className="text-[10px] text-ink-soft">
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
function ClassicBuyerRow({ customer, deliveryInstructions, editable, onDeliveryInstructionsChange, irn, ackNo, ackDate, qrImageDataUrl, eway }: SharedProps) {
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
                  <span className="font-mono font-tabular">GSTIN: {customer.gstin || '—'}</span>
                  <span className="text-ink-faint"> · </span>
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
            {/* Print mode only renders this section when there's something to
                show — an empty dashed placeholder box burned ~10mm on every
                invoice that doesn't use delivery instructions, the same
                waste pattern as the pagination fix above (see Notes below,
                which already followed this rule). */}
            {(editable || deliveryInstructions) && (
              <div className="mt-1 border-t border-dashed border-line pt-0.5">
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
                  <div className="mt-0.5 whitespace-pre-line text-[10px]">{deliveryInstructions}</div>
                )}
              </div>
            )}
          </td>
          <td className="p-1.5 text-right align-top">
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
        <thead>
          <tr className="border-b border-ink bg-surface-alt text-left font-bold">
            <th className="w-9 border-r border-line px-2 py-1">Sl</th>
            <th className="border-r border-line px-2 py-1">Description of Goods</th>
            <th className="w-[78px] border-r border-line px-2 py-1">HSN/SAC</th>
            <th className="w-[92px] border-r border-line px-2 py-1 text-right">Quantity</th>
            <th className="w-[76px] border-r border-line px-2 py-1 text-right">Rate</th>
            <th className="w-14 border-r border-line px-2 py-1 text-right">Per (Unit)</th>
            {editable && <th className="w-14 border-r border-line px-2 py-1 text-right">Disc%</th>}
            {hasAltQty && <th className="w-16 border-r border-line px-2 py-1 text-right">In {altUnitLabel}</th>}
            <th className="w-[100px] px-2 py-1 text-right">Amount</th>
            {editable && <th className="w-6 px-1" />}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={7 + (hasAltQty ? 1 : 0) + (editable ? 2 : 0)} className="py-6 text-center text-ink-faint">
                No line items yet.
              </td>
            </tr>
          ) : (
            lines.map((l, i) => {
              const amount = l.qty * l.rate * (1 - l.discount / 100);
              const altQty = l.altUnit && l.altQtyPerUnit ? l.qty * l.altQtyPerUnit : null;
              return (
                <tr key={l.lineId} className="border-b border-line">
                  <td className="border-r border-line px-2 py-1 align-top font-tabular">{base + i + 1}</td>
                  <td className="border-r border-line px-2 py-1 align-top">{l.name}</td>
                  <td className="border-r border-line px-2 py-1 align-top font-mono">
                    {editable ? (
                      <input
                        value={l.hsn ?? ''}
                        onChange={(e) => onUpdateLine?.(l.lineId, { hsn: e.target.value })}
                        placeholder={DEFAULT_HSN}
                        className="w-16 rounded-sm2 border border-line bg-surface px-1 py-0.5 text-[10.5px] focus:border-brand focus:outline-none"
                      />
                    ) : (
                      l.hsn || DEFAULT_HSN
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
                  {/* Editable mode shows the raw rate (Disc% is a separate
                      input right after it); print mode has no Disc% column
                      at all, so it shows the discount already folded in —
                      Rate × Qty then reads consistently with Amount. */}
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
                </tr>
              );
            })
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

      {((company.pdfShowBankDetails && company.bankName) || company.terms) && (
        <div className="grid grid-cols-2 gap-4 border-t border-line p-1.5 text-[10.5px] break-inside-avoid">
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
            <div className="text-left text-[9.5px] text-ink-faint">
              Received in good condition on : <span className="font-mono font-tabular">_______________</span>
            </div>
            <div className="h-9" />
            <div className="border-t border-ink pt-1">Customer&apos;s Sign</div>
          </div>
          <div className="flex flex-col">
            <div className="h-[11px]" />
            <div className="flex h-9 items-end justify-center pb-1">
              {company.signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.signatureUrl} alt="Authorised signature" className="h-8 object-contain" />
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
