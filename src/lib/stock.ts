import type { Prisma, StockMovementType } from '@prisma/client';
import type { Tx } from './prisma';
import { formatStock, round6, unitFactor, type UnitProduct } from './stock-units';

// Server-side inventory ledger. Every change to Product.stockQty goes
// through applyMovement, which updates the cached balance and appends the
// StockMovement row in the same transaction, so the two can never disagree.
//
// Documents (invoices, purchases, credit notes) don't "reconcile" against
// their past movements — they post the *difference* between what the
// document consumed before and after a change (see postStockChanges). That
// way editing an invoice that predates stock tracking only moves stock by
// what the edit changed, instead of deducting the whole invoice again from
// a count that already reflected it.

export type Shortage = { productId: string; name: string; have: string; need: string };

/** Thrown inside a transaction to roll it back when a change would take a
 * tracked product below zero. Its message lists every short product. */
export class InsufficientStockError extends Error {
  shortages: Shortage[];
  constructor(shortages: Shortage[]) {
    const list = shortages.map((s) => `${s.name} (have ${s.have}, need ${s.need})`).join('; ');
    super(`Not enough stock: ${list}. Reduce the quantity or add stock.`);
    this.shortages = shortages;
  }
}

export type MovementMeta = {
  type: StockMovementType;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  purchaseId?: string | null;
  creditNoteId?: string | null;
  reference?: string | null;
  unitCost?: number | null;
  note?: string | null;
  batchNo?: string | null;
  expiryDate?: Date | null;
  userId?: string | null;
  date?: Date;
};

type ProductForStock = UnitProduct & { id: string; name: string; trackStock: boolean; stockQty: Prisma.Decimal };

async function loadProducts(tx: Tx, ids: string[]): Promise<Map<string, ProductForStock>> {
  if (!ids.length) return new Map();
  const rows = await tx.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, unit: true, packQty: true, trackStock: true, stockQty: true, priceTiers: { select: { unit: true, approxQty: true } } },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

/** Adds `delta` (main units, + in / − out) to one product's stock and logs
 * it. When `enforce` is on, a decrease that would take a tracked product
 * below zero returns a Shortage instead of applying — the conditional UPDATE
 * makes that check race-safe against a concurrent sale of the last box. */
export async function applyMovement(
  tx: Tx,
  product: { id: string; name: string } & UnitProduct,
  delta: number,
  meta: MovementMeta,
  enforce = true
): Promise<{ balance: number } | { shortage: Shortage }> {
  const d = round6(delta);
  const allowNegative = !enforce || d >= 0;
  const rows = await tx.$queryRaw<{ stockQty: Prisma.Decimal }[]>`
    UPDATE "Product" SET "stockQty" = "stockQty" + ${d.toFixed(6)}::numeric
    WHERE id = ${product.id} AND (${allowNegative}::boolean OR NOT "trackStock" OR "stockQty" + ${d.toFixed(6)}::numeric >= -0.000001)
    RETURNING "stockQty"`;
  if (!rows.length) {
    const current = await tx.product.findUnique({ where: { id: product.id }, select: { stockQty: true } });
    const have = Number(current?.stockQty ?? 0);
    return { shortage: { productId: product.id, name: product.name, have: formatStock(have, product), need: formatStock(-d, product) } };
  }
  const balance = Number(rows[0].stockQty);
  await tx.stockMovement.create({
    data: {
      productId: product.id,
      type: meta.type,
      qty: d,
      balanceAfter: balance,
      invoiceId: meta.invoiceId ?? null,
      invoiceNumber: meta.invoiceNumber ?? null,
      purchaseId: meta.purchaseId ?? null,
      creditNoteId: meta.creditNoteId ?? null,
      reference: meta.reference ?? null,
      unitCost: meta.unitCost ?? null,
      note: meta.note ?? null,
      batchNo: meta.batchNo ?? null,
      expiryDate: meta.expiryDate ?? null,
      userId: meta.userId ?? null,
      ...(meta.date ? { date: meta.date } : {}),
    },
  });
  return { balance };
}

/** Main-unit quantity per product for a set of lines (qty × unit factor),
 * also returned per line so callers can snapshot it onto the line row. */
export async function lineStockQuantities(tx: Tx, lines: { productId: string | null; qty: number; unit: string }[]) {
  const ids = [...new Set(lines.map((l) => l.productId).filter((id): id is string => !!id))];
  const products = await loadProducts(tx, ids);
  const perLine = lines.map((l) => {
    const p = l.productId ? products.get(l.productId) : undefined;
    return p ? round6(l.qty * unitFactor(p, l.unit)) : null;
  });
  return perLine;
}

/** Σ stockQty per product, for lines that already carry their snapshot. */
export function sumByProduct(lines: { productId: string | null; stockQty: unknown }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    if (!l.productId || l.stockQty == null) continue;
    out.set(l.productId, round6((out.get(l.productId) ?? 0) + Number(l.stockQty)));
  }
  return out;
}

/** What an invoice holds out of stock: its lines, once it has taken them.
 * Every save takes them — draft, sent or paid alike — so only a draft
 * saved before drafts took stock (Invoice.stockTaken false) holds nothing. */
export function invoiceHeld(stockTaken: boolean, lines: { productId: string | null; stockQty: unknown }[]): Map<string, number> {
  return stockTaken ? sumByProduct(lines) : new Map();
}

/** Posts the stock difference between two states of a document. `before`
 * and `after` are main-unit quantities per product, measured in the
 * document's own direction: what an invoice *consumes*, what a purchase or
 * credit note *adds*. Only tracked products move. Throws
 * InsufficientStockError (rolling back the caller's transaction) listing
 * every product that would go below zero — unless `enforce` is false (the
 * owner's "save anyway"), which lets stock go negative. */
export async function postStockChanges(
  tx: Tx,
  opts: {
    direction: 'out' | 'in';
    before: Map<string, number>;
    after: Map<string, number>;
    increaseType: StockMovementType;
    decreaseType: StockMovementType;
    meta: Omit<MovementMeta, 'type'>;
    perProductMeta?: Map<string, Partial<MovementMeta>>;
    enforce?: boolean;
  }
) {
  const ids = [...new Set([...opts.before.keys(), ...opts.after.keys()])].sort();
  const products = await loadProducts(tx, ids);
  const shortages: Shortage[] = [];
  for (const id of ids) {
    const p = products.get(id);
    if (!p || !p.trackStock) continue;
    const change = round6((opts.after.get(id) ?? 0) - (opts.before.get(id) ?? 0));
    if (Math.abs(change) < 1e-6) continue;
    // An invoice consuming more is stock going down; a purchase adding more
    // is stock going up.
    const delta = opts.direction === 'out' ? -change : change;
    const type = change > 0 ? opts.increaseType : opts.decreaseType;
    const res = await applyMovement(tx, p, delta, { ...opts.meta, ...opts.perProductMeta?.get(id), type }, opts.enforce ?? true);
    if ('shortage' in res) shortages.push(res.shortage);
  }
  if (shortages.length) throw new InsufficientStockError(shortages);
}
