// Purchase-bill arithmetic, shared by the purchase form's live totals and
// src/actions/purchases.ts (which re-runs it on save and stores the result)
// so the screen and the stored bill can never disagree. No server imports.

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type PurchaseLineMath = { qty: number; rate: number; gstRate: number };

export type PurchaseTotals = { taxable: number; cgst: number; sgst: number; igst: number; total: number };

/** Line amount before GST. */
export function lineAmount(l: { qty: number; rate: number }): number {
  return round2((Number(l.qty) || 0) * (Number(l.rate) || 0));
}

/** Taxable value plus input GST — each line taxed at its own rate (a
 * supplier bill can mix 5%, 12% and 18% items), then split into CGST+SGST
 * halves for a same-state supplier or kept whole as IGST for an inter-state
 * one. Exact to the paisa, no rounding to the rupee: this has to match the
 * supplier's printed bill, not set our own total. */
export function computePurchaseTotals(lines: PurchaseLineMath[], interState: boolean): PurchaseTotals {
  let taxable = 0;
  let tax = 0;
  for (const l of lines) {
    const amount = lineAmount(l);
    taxable += amount;
    tax += (amount * (Number(l.gstRate) || 0)) / 100;
  }
  taxable = round2(taxable);
  tax = round2(tax);
  const cgst = interState ? 0 : round2(tax / 2);
  const sgst = interState ? 0 : round2(tax - cgst);
  const igst = interState ? tax : 0;
  return { taxable, cgst, sgst, igst, total: round2(taxable + tax) };
}

/** Most files one bill can carry (bill copies, delivery photos). */
export const PURCHASE_ATTACHMENT_LIMIT = 10;
/** Largest attachment, when it goes straight to Blob storage. Without Blob
 * storage (local dev) files go through a server action instead, capped at
 * 4MB by src/lib/uploads.ts. */
export const PURCHASE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const PURCHASE_ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
