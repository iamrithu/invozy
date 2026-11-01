import type { StockMovementType } from '@prisma/client';
import { formatStock, mainPieces, round6, type StockStatus, type UnitProduct } from '@/lib/stock-units';

// Labels, colours and small text helpers shared by every stock screen (the
// Inventory list, a product's ledger, the drawers, the dashboard cards) so a
// status or movement type always reads and looks the same. Client-safe.

const EPS = 1e-6;

/** Soft tinted chips, matching the approved Inventory mock — the solid
 * Badge variants are reserved for invoice status. `accent` is the coloured
 * left edge on an out/low table row (an inset shadow on its first cell, so
 * the column doesn't shift); `cardAccent` the same edge on a phone card,
 * which already carries a drop shadow. */
export const STATUS_META: Record<StockStatus, { label: string; className: string; accent: string; cardAccent: string }> = {
  in: { label: 'In stock', className: 'bg-green-soft text-green', accent: '', cardAccent: '' },
  low: { label: 'Low', className: 'bg-gold-soft text-gold', accent: 'shadow-[inset_3px_0_0_hsl(var(--gold))]', cardAccent: 'border-l-[3px] border-l-gold' },
  out: { label: 'Out of stock', className: 'bg-red-soft text-red', accent: 'shadow-[inset_3px_0_0_hsl(var(--red))]', cardAccent: 'border-l-[3px] border-l-red' },
  untracked: { label: 'Not tracked', className: 'bg-surface-alt text-ink-soft', accent: '', cardAccent: '' },
};

export const MOVEMENT_META: Record<StockMovementType, { label: string; className: string }> = {
  OPENING: { label: 'Opening', className: 'bg-surface-alt text-ink-soft' },
  PURCHASE: { label: 'Stock in', className: 'bg-green-soft text-green' },
  PURCHASE_RETURN: { label: 'Bill reduced', className: 'bg-gold-soft text-gold' },
  SALE: { label: 'Sale', className: 'bg-brand-light text-brand-dark' },
  SALE_RETURN: { label: 'Return', className: 'bg-green-soft text-green' },
  ADJUSTMENT: { label: 'Adjustment', className: 'bg-gold-soft text-gold' },
  DAMAGE: { label: 'Write-off', className: 'bg-red-soft text-red' },
};

/** A SALE_RETURN an invoice posted itself — edited down, or a draft deleted
 * — rather than goods coming back: it carries an invoice number but no
 * credit note (manual returns carry neither). Shown and counted as a sale
 * reduced, not a return; src/actions/inventory.ts's INVOICE_REVERSAL is the
 * same rule as a query. */
export function isInvoiceReversal(m: { type: StockMovementType; creditNoteId?: string | null; invoiceNumber?: string | null }): boolean {
  return m.type === 'SALE_RETURN' && !m.creditNoteId && !!m.invoiceNumber;
}

export const SALE_REDUCED_META = { label: 'Sale reduced', className: 'bg-gold-soft text-gold' };

/** The loose unit a remainder is counted in ("Pc"), or null when the
 * product only sells whole main units. */
export function smallUnit(p: UnitProduct): string | null {
  const pieces = mainPieces(p);
  if (pieces <= 1) return null;
  return formatStock(1 / pieces, p).replace(/^1\s+/, '');
}

/** "12 Pc per Box" — or null for products sold in one unit only. */
export function packLabel(p: UnitProduct): string | null {
  const small = smallUnit(p);
  return small ? `${mainPieces(p)} ${small} per ${p.unit}` : null;
}

/** A stock count as typed into the inline box: "4" (main units), "4.5",
 * "4+6" (4 Box and 6 loose pieces), "6pc", or "4 box 6 pc". Null when it
 * can't be read. Pieces only make sense for products that have them. */
export function parseCount(text: string, p: UnitProduct): number | null {
  const t = text.trim().toLowerCase().replace(/,/g, '');
  if (!t) return null;
  const pieces = mainPieces(p);
  const num = '(\\d+(?:\\.\\d+)?|\\.\\d+)';
  const pc = '(?:pc|pcs|p|piece|pieces|nos)';
  let m = t.match(new RegExp(`^${num}$`));
  if (m) return round6(Number(m[1]));
  if (pieces <= 1) return null;
  m = t.match(new RegExp(`^${num}\\s*\\+\\s*${num}\\s*${pc}?$`)) ?? t.match(new RegExp(`^${num}\\s*[a-z]*\\s+${num}\\s*${pc}$`));
  if (m) return round6(Number(m[1]) + Number(m[2]) / pieces);
  m = t.match(new RegExp(`^${num}\\s*${pc}$`));
  if (m) return round6(Number(m[1]) / pieces);
  return null;
}

/** The inverse of parseCount — what the inline box shows for a balance:
 * "4" for whole units, "4+6" when there are loose pieces. */
export function formatCountInput(qty: number, p: UnitProduct): string {
  const pieces = mainPieces(p);
  const q = Math.max(0, qty);
  if (pieces <= 1) return String(Math.round(q * 1000) / 1000);
  let whole = Math.floor(q + EPS);
  let rest = Math.round((q - whole) * pieces);
  if (rest >= pieces) {
    whole += 1;
    rest = 0;
  }
  return rest ? `${whole}+${rest}` : String(whole);
}

/** "+1 Box + 6 Pc" / "−6 Pc" — a signed change in counting words. */
export function formatDelta(delta: number, p: UnitProduct): string {
  return `${delta >= 0 ? '+' : '−'}${formatStock(Math.abs(delta), p)}`;
}

/** "31 Oct" for a timestamp, in IST. */
export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** "31 Oct 2026" for a timestamp, in IST. */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** "31 Oct 2026" for a plain `YYYY-MM-DD` (expiry, bill date) — read as the
 * calendar date it is, never shifted by a timezone. */
export function fmtPlainDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Whole days from `todayYmd` to an expiry date (negative once expired). */
export function daysUntil(ymd: string, todayYmd: string): number {
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${todayYmd}T00:00:00Z`)) / 86_400_000);
}

/** "Expired 2 days ago" / "Expires today" / "Expires in 5 days" plus the
 * tone to show it in, given the company's alert window. */
export function expiryText(ymd: string, todayYmd: string, alertDays: number): { text: string; tone: 'red' | 'gold' | 'plain' } {
  const d = daysUntil(ymd, todayYmd);
  if (d < 0) return { text: `Expired ${-d} day${d === -1 ? '' : 's'} ago`, tone: 'red' };
  if (d === 0) return { text: 'Expires today', tone: 'red' };
  if (d <= alertDays) return { text: `Expires in ${d} day${d === 1 ? '' : 's'}`, tone: 'gold' };
  return { text: `Expires ${fmtPlainDate(ymd)}`, tone: 'plain' };
}

/** "12 days" / "< 1 day" / "—" for a days-of-stock-left figure. */
export function daysLeftText(daysLeft: number | null): string {
  if (daysLeft == null) return '—';
  if (daysLeft < 1) return '< 1 day';
  const d = Math.floor(daysLeft);
  return `${d} day${d === 1 ? '' : 's'}`;
}

/** Every unit a product can be counted in, main unit first. */
export function unitOptions(p: UnitProduct): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [p.unit, ...(p.priceTiers ?? []).map((t) => t.unit)]) {
    const k = u.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}
