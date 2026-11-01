import { prisma } from '@/lib/prisma';
import { round6, unitFactor, type UnitProduct } from '@/lib/stock-units';

// Server-only data helpers shared by the Reports actions (profit estimate),
// the CSV exports (products + stock) and the loading sheet. Deliberately NOT
// in src/actions/reports.ts: every exported async function in a 'use server'
// file becomes a public endpoint, and these skip the session check (their
// callers have already done it).

export type ProductMeta = UnitProduct & { id: string; name: string; category: string; unit: string };

/** Name, category and unit ladder for the given products (all products
 * when `ids` is omitted) — what main-unit conversion (unitFactor) and
 * "4 Box + 6 Pc" formatting (formatStock) need. Inactive products are
 * included: old invoices still reference them. */
export async function loadProductMeta(ids?: string[]): Promise<Map<string, ProductMeta>> {
  if (ids && !ids.length) return new Map();
  const rows = await prisma.product.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    select: { id: true, name: true, category: true, unit: true, packQty: true, priceTiers: { select: { unit: true, approxQty: true }, orderBy: { sortOrder: 'asc' } } },
  });
  return new Map(rows.map((p) => [p.id, { ...p, packQty: p.packQty ?? undefined, priceTiers: p.priceTiers.map((t) => ({ unit: t.unit, approxQty: t.approxQty == null ? undefined : Number(t.approxQty) })) }]));
}

/** A line's quantity in its product's main unit: the `stockQty` snapshot
 * taken when the line was saved, else qty × the product's current unit
 * factor (lines saved before snapshots existed), else the raw qty. */
export function mainQtyOf(line: { qty: number; unit: string; stockQty: number | null }, product: ProductMeta | undefined): number {
  if (line.stockQty != null) return line.stockQty;
  return product ? round6(line.qty * unitFactor(product, line.unit)) : line.qty;
}

/** Weighted average purchase cost per MAIN unit (ex-GST), per product.
 *
 * Primary source is the supplier bills themselves (PurchaseItem: Σ qty ×
 * rate ÷ Σ main-unit qty) — every bill line counts, tracked product or
 * not, and free goods on a bill (rate 0) rightly pull the average down.
 * Products with no bill lines fall back to costed stock-ins on the ledger
 * (opening stock or a purchase entered with a cost on the Inventory
 * screen). Products with neither have no known cost and are left out. */
export async function averagePurchaseCosts(products: Map<string, ProductMeta>): Promise<Map<string, number>> {
  const [billRows, ledgerRows] = await Promise.all([
    prisma.$queryRaw<{ productId: string; unit: string; value: number; stockQty: number; qtyNoSnapshot: number }[]>`
      SELECT
        pi."productId" AS "productId",
        pi.unit AS "unit",
        SUM(pi.qty * pi.rate)::float8 AS "value",
        COALESCE(SUM(pi."stockQty"), 0)::float8 AS "stockQty",
        COALESCE(SUM(pi.qty) FILTER (WHERE pi."stockQty" IS NULL), 0)::float8 AS "qtyNoSnapshot"
      FROM "PurchaseItem" pi
      WHERE pi."productId" IS NOT NULL
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<{ productId: string; value: number; qty: number }[]>`
      SELECT "productId", SUM(qty * "unitCost")::float8 AS "value", SUM(qty)::float8 AS "qty"
      FROM "StockMovement"
      WHERE type IN ('PURCHASE', 'OPENING') AND qty > 0 AND "unitCost" IS NOT NULL
      GROUP BY 1
    `,
  ]);

  const fromBills = new Map<string, { value: number; qty: number }>();
  for (const r of billRows) {
    const p = products.get(r.productId);
    const qty = r.stockQty + (p ? r.qtyNoSnapshot * unitFactor(p, r.unit) : r.qtyNoSnapshot);
    const acc = fromBills.get(r.productId) ?? { value: 0, qty: 0 };
    acc.value += r.value;
    acc.qty += qty;
    fromBills.set(r.productId, acc);
  }

  const out = new Map<string, number>();
  for (const [id, { value, qty }] of fromBills) if (qty > 0) out.set(id, value / qty);
  for (const r of ledgerRows) if (!out.has(r.productId) && r.qty > 0) out.set(r.productId, r.value / r.qty);
  return out;
}
