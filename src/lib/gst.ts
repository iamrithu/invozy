// Core billing math — the authoritative, server-side version of the logic
// documented in backend-documentation.md §3. The client may show a live
// preview using the same functions, but only what this module produces
// (called from a Server Action) is ever persisted.

export type LineInput = {
  qty: number;
  rate: number;
  discount: number; // line-level %, 0-100
};

export type GstRates = {
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
};

export type OverallDiscount = {
  type: 'PERCENT' | 'FLAT';
  value: number;
};

export type TotalsResult = {
  subtotal: number;
  overallDiscountAmount: number;
  taxable: number;
  useIgst: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
};

/** §3.1 — IGST applies only when interstate AND enabled; otherwise CGST+SGST, each independently toggleable. */
export function decidesIgst(companyState: string, customerState: string, igstEnabled: boolean): boolean {
  return igstEnabled && companyState.trim().toLowerCase() !== customerState.trim().toLowerCase();
}

/** §3.2 — the single source of truth for invoice totals. Re-run this server-side on every write; never trust a client-supplied total. */
export function computeTotals(
  lines: LineInput[],
  overallDiscount: OverallDiscount,
  rates: GstRates,
  companyState: string,
  customerState: string
): TotalsResult {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.rate * (1 - (l.discount || 0) / 100), 0);

  const overallDiscountAmount =
    overallDiscount.type === 'PERCENT'
      ? subtotal * ((overallDiscount.value || 0) / 100)
      : Math.min(overallDiscount.value || 0, subtotal);

  const taxable = Math.max(subtotal - overallDiscountAmount, 0);

  const useIgst = decidesIgst(companyState, customerState, rates.igstEnabled);

  let cgst = 0,
    sgst = 0,
    igst = 0;
  if (useIgst) {
    igst = taxable * (rates.igstRate / 100);
  } else {
    if (rates.cgstEnabled) cgst = taxable * (rates.cgstRate / 100);
    if (rates.sgstEnabled) sgst = taxable * (rates.sgstRate / 100);
  }

  const rawTotal = taxable + cgst + sgst + igst;
  const total = Math.round(rawTotal);
  const roundOff = total - rawTotal;

  return { subtotal, overallDiscountAmount, taxable, useIgst, cgst, sgst, igst, roundOff, total };
}

/** §3.3 — must be called inside a transaction alongside the Invoice insert so two concurrent requests can never claim the same number. */
export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(4, '0')}`;
}

/** Indian financial year (April–March) for a brand-new company at signup —
 * e.g. a company created in June 2026 or February 2027 both get "2026-27". */
export function currentIndianFY(date = new Date()): string {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** §3.4 — advisory only (matches the prototype's UI, which warns but doesn't block). */
export function isOverCreditLimit(outstandingBefore: number, newInvoiceTotal: number, creditLimit: number): boolean {
  if (!creditLimit || creditLimit <= 0) return false;
  return outstandingBefore + newInvoiceTotal >= creditLimit;
}

/** Status is derived from balance, never set directly — §3.2. */
export function deriveStatus(total: number, amountPaid: number, wasSent: boolean): 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' {
  const balance = total - amountPaid;
  if (balance <= 0.004) return 'PAID';
  if (amountPaid > 0.004) return 'PARTIALLY_PAID';
  return wasSent ? 'SENT' : 'DRAFT';
}

// Locale paired with each supported currency so grouping/symbol placement
// reads naturally (e.g. ₹1,23,456 for INR's lakh/crore grouping vs
// $123,456 for USD) — see Company.currency (prisma/schema.prisma) and the
// currency picker in company-form.tsx. Latin-digit locales throughout
// (e.g. 'en-AE' not 'ar-AE') so amounts never switch numeral systems.
const CURRENCY_LOCALE: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'en-IE',
  GBP: 'en-GB',
  AED: 'en-AE',
};

/** Kept as `fmtInr` (not renamed) since ~70 call sites already use it —
 * `currency` is optional and defaults to INR, so every existing call is
 * unaffected. Callers with a `company` in scope should pass
 * `company.currency` to respect the per-company currency setting. */
export function fmtInr(n: number, currency: string = 'INR'): string {
  const locale = CURRENCY_LOCALE[currency] ?? 'en-IN';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n || 0);
}

/** Display-only capitalization for a unit string ("kg" -> "Kg", "box" ->
 * "Box") — never applied to what's stored, matched in a <select>'s value,
 * or sent to the NIC e-Invoice/e-Way Bill payloads (those uppercase
 * independently, see src/lib/nic/*.ts). */
export function formatUnit(unit: string | null | undefined): string {
  if (!unit) return '';
  return unit.charAt(0).toUpperCase() + unit.slice(1);
}

/** The invoice sheets are handed plain `yyyy-mm-dd` strings (the same value
 * a native `<input type="date">` needs, so callers keep that as their
 * source of truth) — this is purely a display-time reformat to d/M/yyyy
 * (e.g. "18/9/2026", no leading zeros — matches the rest of the app's
 * `toLocaleDateString('en-IN')` convention) for wherever a sheet prints the
 * date instead of editing it. */
export function formatInvoiceDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN');
}

/** Ice/dairy invoices sold through this app are overwhelmingly HSN 2105
 * (edible ice) — used as the printed default whenever a line item has no
 * HSN/SAC of its own, so the PDF never shows a blank/placeholder code. */
export const DEFAULT_HSN = '21050000';

export type UnitSummaryRow = { unit: string; count: number; qty: number };

/** Per-unit quantity totals across every line item — e.g. "135 Box, 4,075 Pc"
 * — so whoever's loading the delivery can see total boxes/kg/pieces without
 * adding up the Qty column themselves. Row order follows each unit's first
 * appearance in `lines`, so it reads in the same order as the item table
 * rather than jumping around alphabetically. */
export function computeUnitSummary(lines: { unit: string; qty: number }[]): UnitSummaryRow[] {
  const order: string[] = [];
  const byUnit = new Map<string, UnitSummaryRow>();
  for (const l of lines) {
    const unit = l.unit || '—';
    let row = byUnit.get(unit);
    if (!row) {
      row = { unit, count: 0, qty: 0 };
      byUnit.set(unit, row);
      order.push(unit);
    }
    row.count++;
    row.qty += l.qty;
  }
  return order.map((u) => byUnit.get(u)!);
}

export type HsnSummaryRow = {
  hsn: string;
  taxableValue: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
};

/** HSN/SAC-wise tax breakdown for the CLASSIC (Tally-style) template — Modern
 * template + computeTotals() only ever need one whole-invoice CGST/SGST/IGST
 * bucket, but a classic GST invoice must show taxable value and tax split
 * per HSN code. The invoice-level overall discount (§3.2) doesn't belong to
 * any one HSN, so it's allocated across groups proportionally to each
 * group's share of the pre-discount subtotal — the resulting rows sum back
 * exactly to computeTotals()'s taxable/cgst/sgst/igst for the same lines. */
export function computeHsnSummary(
  lines: (LineInput & { hsn?: string | null })[],
  overallDiscount: OverallDiscount,
  rates: GstRates,
  companyState: string,
  customerState: string,
  defaultHsn: string = DEFAULT_HSN
): HsnSummaryRow[] {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.rate * (1 - (l.discount || 0) / 100), 0);
  const overallDiscountAmount = overallDiscount.type === 'PERCENT' ? subtotal * ((overallDiscount.value || 0) / 100) : Math.min(overallDiscount.value || 0, subtotal);
  const useIgst = decidesIgst(companyState, customerState, rates.igstEnabled);

  const groups = new Map<string, number>();
  for (const l of lines) {
    const hsn = l.hsn?.trim() || defaultHsn;
    const lineTaxable = l.qty * l.rate * (1 - (l.discount || 0) / 100);
    groups.set(hsn, (groups.get(hsn) ?? 0) + lineTaxable);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hsn, groupSubtotal]) => {
      const share = subtotal > 0 ? groupSubtotal / subtotal : 0;
      const taxableValue = Math.max(groupSubtotal - overallDiscountAmount * share, 0);
      const cgstAmount = !useIgst && rates.cgstEnabled ? taxableValue * (rates.cgstRate / 100) : 0;
      const sgstAmount = !useIgst && rates.sgstEnabled ? taxableValue * (rates.sgstRate / 100) : 0;
      const igstAmount = useIgst ? taxableValue * (rates.igstRate / 100) : 0;
      return {
        hsn,
        taxableValue,
        cgstRate: !useIgst && rates.cgstEnabled ? rates.cgstRate : 0,
        cgstAmount,
        sgstRate: !useIgst && rates.sgstEnabled ? rates.sgstRate : 0,
        sgstAmount,
        igstRate: useIgst ? rates.igstRate : 0,
        igstAmount,
        totalTax: cgstAmount + sgstAmount + igstAmount,
      };
    });
}
