// Pure unit-conversion + display helpers for inventory — no server imports,
// so the Inventory screen, the invoice builder and the server actions all
// format and convert stock exactly the same way.
//
// Stock is always counted in a product's main `unit` (its first price tier).
// Other tiers convert through `approxQty` ("1 Box ≈ 12 Piece"): a tier's
// approxQty is how many base pieces it holds, and a tier without one is a
// single piece. So with Box (12) + Piece (—), 1 Piece = 1/12 Box.

type TierLike = { unit: string; approxQty?: unknown };
export type UnitProduct = { unit: string; packQty?: unknown; priceTiers?: TierLike[] };

const EPS = 1e-6;

function same(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Rounds to 6 decimals — enough for 1/12, 1/24, 1/30 pieces while keeping
 * repeated float sums (12 × 1/12) from drifting off a whole number. */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Base pieces in one main unit (e.g. 12 for "Box of 12"), 1 when unknown. */
export function mainPieces(p: UnitProduct): number {
  const main = p.priceTiers?.find((t) => same(t.unit, p.unit));
  return Number(main?.approxQty ?? p.packQty ?? 0) || 1;
}

/** How many main units one `unit` of this product is. 1 for the main unit or
 * any unit the product doesn't list (ad-hoc units are counted 1:1). */
export function unitFactor(p: UnitProduct, unit: string | null | undefined): number {
  if (!unit || same(unit, p.unit)) return 1;
  const tier = p.priceTiers?.find((t) => same(t.unit, unit));
  if (!tier) return 1;
  return (Number(tier.approxQty ?? 0) || 1) / mainPieces(p);
}

/** True when a product sells in a smaller unit than its main one but has no
 * "pieces per main unit" set — stock tracking can't convert those sales, so
 * the product form requires it before tracking can be switched on. */
export function needsPackSize(p: UnitProduct): boolean {
  const tiers = p.priceTiers ?? [];
  return tiers.length > 1 && mainPieces(p) <= 1 && tiers.some((t) => !same(t.unit, p.unit) && !(Number(t.approxQty ?? 0) > 1));
}

const SHORT: Record<string, string> = { piece: 'Pc', pieces: 'Pc', pcs: 'Pc', pc: 'Pc', nos: 'Nos', packet: 'Pkt', packets: 'Pkt' };

/** The unit loose remainders are shown in ("Pc"), or null when the product
 * has no smaller unit than its main one. */
function smallUnitLabel(p: UnitProduct): string | null {
  const small = p.priceTiers?.find((t) => !same(t.unit, p.unit) && unitFactor(p, t.unit) < 1 - EPS);
  if (!small) return mainPieces(p) > 1 ? 'Pc' : null;
  return SHORT[small.unit.trim().toLowerCase()] ?? unitLabel(small.unit);
}

/** "box" → "Box", "kg" → "Kg" — units are stored as typed, but stock
 * figures read better with the same capitalisation as the rest of the UI. */
export function unitLabel(unit: string): string {
  const u = unit.trim();
  return u ? u.charAt(0).toUpperCase() + u.slice(1) : u;
}

function trimNum(n: number) {
  return String(Math.round(n * 100) / 100);
}

/** "4 Box + 6 Pc", "6 Pc", "12 Box", "2.5 Kg" — a main-unit quantity in the
 * words a person counting a freezer would use. */
export function formatStock(qty: number, p: UnitProduct): string {
  const sign = qty < -EPS ? '−' : '';
  const abs = Math.abs(qty);
  const pieces = mainPieces(p);
  const small = smallUnitLabel(p);
  if (pieces <= 1 || !small) return `${sign}${trimNum(abs)} ${unitLabel(p.unit)}`;
  let whole = Math.floor(abs + EPS);
  let rest = Math.round((abs - whole) * pieces);
  if (rest >= pieces) {
    whole += 1;
    rest = 0;
  }
  if (whole && rest) return `${sign}${whole} ${unitLabel(p.unit)} + ${rest} ${small}`;
  if (rest) return `${sign}${rest} ${small}`;
  return `${sign}${whole} ${unitLabel(p.unit)}`;
}

export type StockStatus = 'untracked' | 'out' | 'low' | 'in';

export function stockStatus(p: { trackStock: boolean; stockQty: unknown; lowStockAt?: unknown }): StockStatus {
  if (!p.trackStock) return 'untracked';
  const q = Number(p.stockQty);
  if (q <= EPS) return 'out';
  if (p.lowStockAt != null && q <= Number(p.lowStockAt) + EPS) return 'low';
  return 'in';
}
