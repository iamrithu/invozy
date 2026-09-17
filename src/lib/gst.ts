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

export function fmtInr(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);
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
export function computeHsnSummary(lines: (LineInput & { hsn?: string | null })[], overallDiscount: OverallDiscount, rates: GstRates, companyState: string, customerState: string): HsnSummaryRow[] {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.rate * (1 - (l.discount || 0) / 100), 0);
  const overallDiscountAmount = overallDiscount.type === 'PERCENT' ? subtotal * ((overallDiscount.value || 0) / 100) : Math.min(overallDiscount.value || 0, subtotal);
  const useIgst = decidesIgst(companyState, customerState, rates.igstEnabled);

  const groups = new Map<string, number>();
  for (const l of lines) {
    const hsn = l.hsn?.trim() || '—';
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
