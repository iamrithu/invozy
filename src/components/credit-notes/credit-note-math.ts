// Credit-note arithmetic, shared by the credit-note form's live totals and
// src/actions/credit-notes.ts (which re-runs it inside the save transaction
// and stores the result) so what the screen shows and what gets saved can
// never disagree. No server imports.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type CnLine = { qty: number; rate: number; discount: number };

/** The GST a credit note reverses — always the original invoice's own
 * snapshot (never today's company rates), flattened so a disabled tax is
 * simply a 0% rate. Stored as-is on the CreditNote row. */
export type CnRates = { cgstRate: number; sgstRate: number; igstRate: number; interState: boolean };

export type CnTotals = {
  /** Σ qty × rate, before any discount. */
  gross: number;
  /** Line-level discounts (each line's disc%). */
  itemDiscount: number;
  /** The invoice's bill-level discount, applied proportionally. */
  billDiscount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
};

/** One line's value after its own discount. */
export function lineNet(l: CnLine): number {
  return (Number(l.qty) || 0) * (Number(l.rate) || 0) * (1 - (Number(l.discount) || 0) / 100);
}

/** What share of each line's own amount the invoice actually charged GST
 * on: its stored taxable value ÷ the sum of its line amounts. Below 1 when
 * the invoice had a bill-level discount, so crediting a line gives back
 * what the customer really paid for it, not its pre-discount price. */
export function invoiceBillFactor(invoiceTaxable: number, invoiceLines: CnLine[]): number {
  const net = invoiceLines.reduce((s, l) => s + lineNet(l), 0);
  if (!(net > 0)) return 1;
  return Math.min(1, Math.max(0, invoiceTaxable / net));
}

/** The invoice's GST snapshot as the credit note will store it. */
export function creditNoteRates(inv: {
  interState: boolean;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
}): CnRates {
  if (inv.interState) return { cgstRate: 0, sgstRate: 0, igstRate: inv.igstEnabled ? inv.igstRate : 0, interState: true };
  return { cgstRate: inv.cgstEnabled ? inv.cgstRate : 0, sgstRate: inv.sgstEnabled ? inv.sgstRate : 0, igstRate: 0, interState: false };
}

/** Totals for a credit note. Every component is rounded to the paisa so the
 * printed rows add up exactly; the total is rounded to the rupee like an
 * invoice's. */
export function computeCreditNoteTotals(lines: CnLine[], billFactor: number, rates: CnRates): CnTotals {
  const gross = round2(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0));
  const net = round2(lines.reduce((s, l) => s + lineNet(l), 0));
  const taxable = round2(net * billFactor);
  const cgst = rates.interState ? 0 : round2((taxable * rates.cgstRate) / 100);
  const sgst = rates.interState ? 0 : round2((taxable * rates.sgstRate) / 100);
  const igst = rates.interState ? round2((taxable * rates.igstRate) / 100) : 0;
  const raw = taxable + cgst + sgst + igst;
  const total = Math.round(raw);
  return {
    gross,
    itemDiscount: round2(gross - net),
    billDiscount: round2(net - taxable),
    taxable,
    cgst,
    sgst,
    igst,
    roundOff: round2(total - raw),
    total,
  };
}

// ---------------------------------------------------------------------------
// How much of each invoice line is still open to credit
// ---------------------------------------------------------------------------

export type CreditableLine = { key: string; productId: string | null; name: string; unit: string; rate: number; qty: number };
export type CreditedItem = { productId: string | null; name: string; unit: string; rate: number; qty: number };

const norm = (s: string) => s.trim().toLowerCase();

function sameGoods(line: CreditableLine, item: CreditedItem): boolean {
  if (norm(line.unit) !== norm(item.unit)) return false;
  // A deleted product nulls the link on both rows, so fall back to the
  // snapshotted name (ad-hoc lines never had a product to begin with).
  if (line.productId || item.productId) return line.productId === item.productId;
  return norm(line.name) === norm(item.name);
}

/** Quantity already credited against each invoice line by earlier credit
 * notes. Credit-note items don't point at a specific invoice line, so each
 * one is matched by product + unit + rate; when its rate was edited (a
 * price correction) it falls back to the first line of the same product and
 * unit that still has room, skipping free (₹0) lines unless it is one. */
export function creditedPerLine(lines: CreditableLine[], credited: CreditedItem[]): Map<string, number> {
  const used = new Map(lines.map((l) => [l.key, 0]));
  const room = (l: CreditableLine) => l.qty - (used.get(l.key) ?? 0);
  for (const item of credited) {
    let left = Number(item.qty) || 0;
    const candidates = lines.filter((l) => sameGoods(l, item));
    const ordered = [
      ...candidates.filter((l) => Math.abs(l.rate - item.rate) < 0.005),
      ...candidates.filter((l) => Math.abs(l.rate - item.rate) >= 0.005 && (l.rate > 0 || item.rate === 0)),
    ];
    for (const l of ordered) {
      if (left <= 1e-6) break;
      const take = Math.min(left, room(l));
      if (take <= 1e-6) continue;
      used.set(l.key, (used.get(l.key) ?? 0) + take);
      left -= take;
    }
  }
  return used;
}

/** Credit-note reasons, in the order the form offers them. `restock` is
 * the "Put items back in stock" default each one starts with. */
export const CREDIT_REASONS = [
  { id: 'RETURN', label: 'Goods returned', restock: true },
  { id: 'DAMAGED', label: 'Damaged on delivery', restock: false },
  { id: 'RATE', label: 'Rate difference or extra discount', restock: false },
  { id: 'OTHER', label: 'Other', restock: false },
] as const;

export type CreditReasonId = (typeof CREDIT_REASONS)[number]['id'];

/** What's stored in CreditNote.reason — the reason's label, plus the
 * owner's note when there is one ("Goods returned — 2 boxes melted"). */
export function creditReasonText(id: CreditReasonId, note?: string | null): string {
  const label = CREDIT_REASONS.find((r) => r.id === id)?.label ?? 'Other';
  const extra = note?.trim();
  if (!extra) return label;
  return id === 'OTHER' ? extra : `${label} — ${extra}`;
}
