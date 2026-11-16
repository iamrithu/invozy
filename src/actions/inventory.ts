'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { Prisma, type StockMovementType } from '@prisma/client';
import { prisma, type Tx } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { applyMovement } from '@/lib/stock';
import { istDayRangeUtc, todayIst } from '@/lib/dates';
import { formatStock, needsPackSize, round6, stockStatus, stockUnits, unitFactor, type StockStatus } from '@/lib/stock-units';

// The Inventory screens' data layer: the stock list with its status chips,
// one product's ledger, counts/stock-ins/write-offs, batches on hand, and the
// dashboard's stock cards. Every change to a product's stock goes through
// src/lib/stock.ts's applyMovement so Product.stockQty and the StockMovement
// ledger never disagree; quantities are always in the product's MAIN unit.

const EPS = 1e-6;
const DAY_MS = 24 * 60 * 60 * 1000;
/** "Days left" and reorder suggestions are based on this many days of sales. */
const SALES_WINDOW_DAYS = 30;
/** How far back batches are looked for. Frozen stock doesn't sit for a year,
 * and the bound keeps the batch lookup cheap as purchases pile up. */
const LOT_LOOKBACK_DAYS = 400;

const productSelect = {
  id: true,
  name: true,
  category: true,
  unit: true,
  price: true,
  packQty: true,
  active: true,
  trackStock: true,
  stockQty: true,
  lowStockAt: true,
  priceTiers: { select: { unit: true, price: true, approxQty: true }, orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

/** A product as the stock screens see it — Decimals already numbers, so it
 * crosses the server-action boundary and feeds stock-units.ts directly. */
export type StockProduct = {
  id: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  packQty: number | null;
  active: boolean;
  trackStock: boolean;
  stockQty: number;
  lowStockAt: number | null;
  priceTiers: { unit: string; price: number; approxQty: number | null }[];
};

function toStockProduct(p: ProductRow): StockProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    price: Number(p.price),
    packQty: p.packQty,
    active: p.active,
    trackStock: p.trackStock,
    stockQty: Number(p.stockQty),
    lowStockAt: p.lowStockAt == null ? null : Number(p.lowStockAt),
    priceTiers: p.priceTiers.map((t) => ({ unit: t.unit, price: Number(t.price), approxQty: t.approxQty == null ? null : Number(t.approxQty) })),
  };
}

/** `YYYY-MM-DD` → the instant a dated stock row is stored at. Today's entries
 * keep the real time so the ledger reads in the order things happened; a
 * back-dated one is stored at that day's midnight UTC, the same convention
 * invoice and purchase dates use. */
function movementDate(date?: string | null): Date {
  if (!date || date === todayIst()) return new Date();
  return new Date(date);
}

function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function cleanText(s?: string | null): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/** Today (IST) as a UTC-midnight Date, plus the last day a batch can expire
 * on and still count as "expiring soon". Expiry dates are stored at UTC
 * midnight of the chosen day, so these compare like-for-like. */
function expiryWindow(alertDays: number) {
  const today = new Date(todayIst());
  return { today, cutoff: new Date(today.getTime() + Math.max(0, alertDays) * DAY_MS) };
}

// ---------------------------------------------------------------------------
// Sales rate, days left, reorder
// ---------------------------------------------------------------------------

/** Net units sold per day over the last 30 days (sales minus returns, in main
 * units), per product. */
async function averageDailySales(productIds: string[]): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const since = new Date(Date.now() - SALES_WINDOW_DAYS * DAY_MS);
  const rows = await prisma.stockMovement.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, type: { in: ['SALE', 'SALE_RETURN'] }, date: { gte: since } },
    _sum: { qty: true },
  });
  // SALE rows are negative and returns positive, so the negated sum is what
  // actually left the freezer.
  return new Map(rows.map((r) => [r.productId, Math.max(0, -Number(r._sum.qty ?? 0)) / SALES_WINDOW_DAYS]));
}

/** Days of stock left at the recent sales rate, and how much to reorder so
 * the shelf covers two lead times (one while the order arrives, one after).
 * Null when the product isn't tracked or hasn't sold in 30 days — there's
 * no rate to project from. */
function forecast(p: StockProduct, avgDaily: number | undefined, leadDays: number) {
  if (!p.trackStock || !avgDaily || avgDaily <= EPS) return { avgDailySales: avgDaily ? round6(avgDaily) : 0, daysLeft: null, suggestedReorder: null };
  const stock = Math.max(0, p.stockQty);
  return {
    avgDailySales: round6(avgDaily),
    daysLeft: Math.floor((stock / avgDaily) * 10) / 10,
    suggestedReorder: Math.max(0, Math.ceil(avgDaily * leadDays * 2 - stock - EPS)),
  };
}

// ---------------------------------------------------------------------------
// Batches on hand (FIFO)
// ---------------------------------------------------------------------------

type Lot = { batchNo: string | null; expiryDate: Date | null; qty: number; date: Date; order: number; resets: boolean };

export type OnHandBatch = { batchNo: string | null; expiryDate: string | null; remaining: number; receivedAt: string };

/** Every delivery of stock that could still be on the shelf, newest first.
 *
 * Purchases come from their own lines (PurchaseItem), not their movements:
 * a bill can carry several batches of one product, and editing only a batch
 * number moves no stock, so the lines are the only place the current batch
 * lives. Stock-ins made without a purchase (the Stock in drawer) and opening
 * counts come from the ledger. A purchase that was later deleted leaves its
 * movements behind (unlinked) together with the reversal that took the
 * stock back out, so unlinked purchase rows are netted per bill reference
 * and a fully reversed bill drops out. An opening count `resets` — it's a
 * fresh physical count, so nothing older than it can still be unaccounted
 * for. */
async function loadLots(productIds: string[]): Promise<Map<string, Lot[]>> {
  const out = new Map<string, Lot[]>();
  if (!productIds.length) return out;
  const since = new Date(Date.now() - LOT_LOOKBACK_DAYS * DAY_MS);
  const [items, moves] = await Promise.all([
    prisma.purchaseItem.findMany({
      where: { productId: { in: productIds }, stockQty: { gt: 0 }, purchase: { date: { gte: since } } },
      select: { productId: true, stockQty: true, batchNo: true, expiryDate: true, purchase: { select: { date: true, createdAt: true } } },
    }),
    prisma.stockMovement.findMany({
      where: { productId: { in: productIds }, purchaseId: null, type: { in: ['OPENING', 'PURCHASE', 'PURCHASE_RETURN'] }, date: { gte: since } },
      select: { productId: true, type: true, qty: true, balanceAfter: true, batchNo: true, expiryDate: true, reference: true, date: true, createdAt: true },
    }),
  ]);

  const push = (productId: string, lot: Lot) => {
    const list = out.get(productId);
    if (list) list.push(lot);
    else out.set(productId, [lot]);
  };

  for (const it of items) {
    if (!it.productId) continue;
    push(it.productId, {
      batchNo: it.batchNo,
      expiryDate: it.expiryDate,
      qty: Number(it.stockQty),
      date: it.purchase.date,
      order: it.purchase.createdAt.getTime(),
      resets: false,
    });
  }

  const unlinked = new Map<string, typeof moves>();
  for (const m of moves) {
    if (m.type === 'OPENING') {
      const counted = Number(m.balanceAfter);
      if (counted > EPS) push(m.productId, { batchNo: m.batchNo, expiryDate: m.expiryDate, qty: counted, date: m.date, order: m.createdAt.getTime(), resets: true });
      continue;
    }
    const key = `${m.productId}|${m.reference ?? ''}`;
    const group = unlinked.get(key);
    if (group) group.push(m);
    else unlinked.set(key, [m]);
  }
  for (const rows of unlinked.values()) {
    const ins = rows.filter((r) => r.type === 'PURCHASE' && Number(r.qty) > 0);
    if (!ins.length) continue;
    if (!rows.some((r) => r.type === 'PURCHASE_RETURN')) {
      for (const r of ins) push(r.productId, { batchNo: r.batchNo, expiryDate: r.expiryDate, qty: Number(r.qty), date: r.date, order: r.createdAt.getTime(), resets: false });
      continue;
    }
    const net = rows.reduce((s, r) => s + Number(r.qty), 0);
    if (net <= EPS) continue;
    const latest = ins.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    push(latest.productId, { batchNo: latest.batchNo, expiryDate: latest.expiryDate, qty: net, date: latest.date, order: latest.createdAt.getTime(), resets: false });
  }

  // Newest first by calendar day, then by when each was recorded: a bill
  // dated today is stored at midnight, but if it was entered after this
  // morning's opening count it's newer than that count, not older.
  for (const lots of out.values()) lots.sort((a, b) => istDay(b.date).localeCompare(istDay(a.date)) || b.order - a.order);
  return out;
}

function istDay(d: Date): string {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Which deliveries the current stock is made of, assuming the oldest stock
 * was sold first: the newest deliveries absorb the balance until it runs
 * out. Only deliveries that carried a batch number or expiry date are
 * returned (merged when two deliveries share one), earliest expiry first. */
function allocateBatches(lots: Lot[] | undefined, stock: number): OnHandBatch[] {
  let left = round6(stock);
  const merged = new Map<string, OnHandBatch>();
  for (const lot of lots ?? []) {
    if (left <= EPS) break;
    const take = Math.min(left, lot.qty);
    left = round6(left - take);
    if (take > EPS && (lot.batchNo || lot.expiryDate)) {
      const key = `${lot.batchNo ?? ''}|${isoDate(lot.expiryDate) ?? ''}`;
      const prev = merged.get(key);
      if (prev) {
        prev.remaining = round6(prev.remaining + take);
        if (lot.date.toISOString() < prev.receivedAt) prev.receivedAt = lot.date.toISOString();
      } else {
        merged.set(key, { batchNo: lot.batchNo, expiryDate: isoDate(lot.expiryDate), remaining: round6(take), receivedAt: lot.date.toISOString() });
      }
    }
    if (lot.resets) break;
  }
  return [...merged.values()].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate) || a.receivedAt.localeCompare(b.receivedAt);
    if (a.expiryDate) return -1;
    if (b.expiryDate) return 1;
    return a.receivedAt.localeCompare(b.receivedAt);
  });
}

/** Tracked, in-stock products that have an on-hand batch expiring on or
 * before `cutoff` (already-expired ones included) → those batches. A cheap
 * "any batch near expiry at all?" query narrows the products first, so the
 * full batch walk only runs for the few that could match. */
async function expiringBatches(products: StockProduct[], cutoff: Date): Promise<Map<string, OnHandBatch[]>> {
  const ids = products.filter((p) => p.trackStock && p.stockQty > EPS).map((p) => p.id);
  const out = new Map<string, OnHandBatch[]>();
  if (!ids.length) return out;
  const since = new Date(Date.now() - LOT_LOOKBACK_DAYS * DAY_MS);
  const [fromBills, fromLedger] = await Promise.all([
    prisma.purchaseItem.findMany({
      where: { productId: { in: ids }, expiryDate: { lte: cutoff }, purchase: { date: { gte: since } } },
      select: { productId: true },
      distinct: ['productId'],
    }),
    prisma.stockMovement.findMany({
      where: { productId: { in: ids }, purchaseId: null, type: { in: ['OPENING', 'PURCHASE'] }, expiryDate: { lte: cutoff }, date: { gte: since } },
      select: { productId: true },
      distinct: ['productId'],
    }),
  ]);
  const candidates = [...new Set([...fromBills.map((r) => r.productId as string), ...fromLedger.map((r) => r.productId)])];
  if (!candidates.length) return out;
  const lots = await loadLots(candidates);
  const cutoffIso = isoDate(cutoff)!;
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const id of candidates) {
    const p = byId.get(id);
    if (!p) continue;
    const soon = allocateBatches(lots.get(id), p.stockQty).filter((b) => b.expiryDate && b.expiryDate <= cutoffIso);
    if (soon.length) out.set(id, soon);
  }
  return out;
}

/** Weighted average cost per main unit, from stock-ins that recorded a cost. */
async function averageCosts(productIds: string[]): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const rows = await prisma.$queryRaw<{ productId: string; avg: unknown }[]>(Prisma.sql`
    SELECT "productId", SUM("qty" * "unitCost") / NULLIF(SUM("qty"), 0) AS avg
    FROM "StockMovement"
    WHERE "type" = 'PURCHASE' AND "qty" > 0 AND "unitCost" IS NOT NULL AND "productId" IN (${Prisma.join(productIds)})
    GROUP BY "productId"`);
  return new Map(rows.filter((r) => r.avg != null).map((r) => [r.productId, Number(r.avg)]));
}

// ---------------------------------------------------------------------------
// Inventory list
// ---------------------------------------------------------------------------

export type InventoryStatusFilter = 'all' | 'in' | 'low' | 'out' | 'untracked' | 'reorder' | 'expiring';

export type InventoryRow = StockProduct & {
  status: StockStatus;
  avgDailySales: number;
  daysLeft: number | null;
  suggestedReorder: number | null;
  /** Tracked and due to run out within the reorder lead time. */
  reorder: boolean;
  /** Earliest expiry among on-hand batches inside the alert window. */
  nextExpiry: string | null;
  lastMovementAt: string | null;
  lastMovementType: StockMovementType | null;
  /** The last movement was an invoice reversal (INVOICE_REVERSAL). */
  lastMovementReversal: boolean;
};

export type InventoryPage = {
  items: InventoryRow[];
  total: number;
  counts: Record<InventoryStatusFilter, number>;
  reorderLeadDays: number;
  expiryAlertDays: number;
};

/** The Inventory list: every live product (plus hidden ones still being
 * tracked — they can still hold stock), with status, days of stock left and
 * reorder suggestion. The chip counts follow the search and category filters
 * but not the status filter, so they always say what clicking a chip will
 * show. The catalog is small enough to classify in memory; only the visible
 * page then fetches its "last change". */
export async function listInventoryPage(opts?: {
  search?: string;
  category?: string;
  status?: InventoryStatusFilter;
  page?: number;
  pageSize?: number;
}): Promise<InventoryPage> {
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const status = opts?.status ?? 'all';
  const search = opts?.search?.trim();
  const where: Prisma.ProductWhereInput = {
    AND: [
      { OR: [{ active: true }, { trackStock: true }] },
      search ? { name: { contains: search, mode: 'insensitive' } } : {},
      opts?.category && opts.category !== 'all' ? { category: opts.category } : {},
    ],
  };
  const [company, rows] = await Promise.all([
    getCompany(),
    prisma.product.findMany({ where, select: productSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
  ]);
  const products = rows.map(toStockProduct);
  const { cutoff } = expiryWindow(company.expiryAlertDays);
  const [sales, expiring] = await Promise.all([
    averageDailySales(products.filter((p) => p.trackStock).map((p) => p.id)),
    expiringBatches(products, cutoff),
  ]);

  const enriched = products.map((p) => {
    const f = forecast(p, sales.get(p.id), company.reorderLeadDays);
    return {
      ...p,
      status: stockStatus(p),
      ...f,
      // Running out = still has stock but won't last the lead time. A product
      // already at 0 is "Out of stock", not "about to run out".
      reorder: p.stockQty > EPS && f.daysLeft != null && f.daysLeft <= company.reorderLeadDays,
      nextExpiry: expiring.get(p.id)?.[0]?.expiryDate ?? null,
    };
  });

  const counts: Record<InventoryStatusFilter, number> = { all: enriched.length, in: 0, low: 0, out: 0, untracked: 0, reorder: 0, expiring: 0 };
  for (const r of enriched) {
    counts[r.status]++;
    if (r.reorder) counts.reorder++;
    if (r.nextExpiry) counts.expiring++;
  }

  let filtered = enriched.filter((r) =>
    status === 'all' ? true : status === 'reorder' ? r.reorder : status === 'expiring' ? !!r.nextExpiry : r.status === status
  );
  // The two "act on this" views sort by urgency instead of by name.
  if (status === 'reorder') filtered = filtered.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  if (status === 'expiring') filtered = filtered.sort((a, b) => (a.nextExpiry ?? '').localeCompare(b.nextExpiry ?? ''));

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const ids = pageRows.map((r) => r.id);
  const last = ids.length
    ? await prisma.$queryRaw<{ productId: string; type: StockMovementType; date: Date; reversal: boolean }[]>(Prisma.sql`
        SELECT DISTINCT ON ("productId") "productId", "type"::text AS "type", "date",
          ("type" = 'SALE_RETURN' AND "creditNoteId" IS NULL AND "invoiceNumber" IS NOT NULL) AS "reversal"
        FROM "StockMovement" WHERE "productId" IN (${Prisma.join(ids)})
        ORDER BY "productId", "createdAt" DESC, "id" DESC`)
    : [];
  const lastById = new Map(last.map((l) => [l.productId, l]));

  return {
    items: pageRows.map((r) => {
      const l = lastById.get(r.id);
      return { ...r, lastMovementAt: l ? new Date(l.date).toISOString() : null, lastMovementType: l?.type ?? null, lastMovementReversal: !!l?.reversal };
    }),
    total: filtered.length,
    counts,
    reorderLeadDays: company.reorderLeadDays,
    expiryAlertDays: company.expiryAlertDays,
  };
}

/** Every live product with its stock fields — for the Stock in drawer's
 * and the purchase form's product pickers (filtered on the client; the
 * catalog is a few hundred rows at most). Untracked products are included
 * so a picker can explain why they can't take stock yet. `includeIds` adds
 * hidden products an existing bill still refers to. */
export async function listStockProducts(includeIds?: string[]): Promise<StockProduct[]> {
  await requireUser();
  const ids = (includeIds ?? []).filter(Boolean);
  const rows = await prisma.product.findMany({
    where: ids.length ? { OR: [{ active: true }, { id: { in: ids } }] } : { active: true },
    select: productSelect,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toStockProduct);
}

// ---------------------------------------------------------------------------
// Counts, stock-ins, write-offs
// ---------------------------------------------------------------------------

/** Locks the product row for the rest of the transaction and reads it — a
 * count sets the balance *relative* to what's there, so a sale committing
 * between the read and the write would otherwise make the count wrong. */
async function lockProduct(tx: Tx, productId: string) {
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
  const row = await tx.product.findUnique({ where: { id: productId }, select: productSelect });
  if (!row) throw new Error('This product no longer exists.');
  return toStockProduct(row);
}

function packSizeError(p: StockProduct) {
  return `Set how many pieces are in one ${p.unit} for ${p.name} first (Products → Edit), so sales in pieces can be counted.`;
}

/** A physical count typed into the Inventory list (or the ledger's "Count
 * correction"): posts an ADJUSTMENT for the difference, or — for a product
 * not tracked yet — switches tracking on with an OPENING movement. Never
 * blocked by the zero floor: a count is the truth, whatever the ledger
 * thought. `startedTracking` tells the Undo toast to switch tracking back
 * off. */
export async function setStockCount(
  productId: string,
  counted: number,
  note?: string | null
): Promise<ActionResult<{ balance: number; previous: number; startedTracking: boolean; changed: boolean }>> {
  try {
    const user = await requireUser();
    const value = round6(Number(counted));
    if (!Number.isFinite(value) || value < 0) return { error: 'Stock can’t be below zero. To write off damaged stock, use Adjust → Damaged / expired.' };

    const result = await prisma.$transaction(async (tx) => {
      const p = await lockProduct(tx, productId);
      const previous = p.stockQty;
      const startedTracking = !p.trackStock;
      if (startedTracking) {
        if (needsPackSize(p)) throw new Error(packSizeError(p));
        await tx.product.update({ where: { id: p.id }, data: { trackStock: true } });
      } else if (Math.abs(value - previous) < EPS) {
        return { p, previous, balance: previous, startedTracking, changed: false };
      }
      const res = await applyMovement(
        tx,
        p,
        value - previous,
        { type: startedTracking ? 'OPENING' : 'ADJUSTMENT', note: cleanText(note) ?? (startedTracking ? 'Opening count' : 'Stock count'), userId: user.id },
        false
      );
      if ('shortage' in res) throw new Error('Could not save the count. Please try again.');
      return { p, previous, balance: res.balance, startedTracking, changed: true };
    });

    if (result.changed) {
      await logActivity({
        userId: user.id,
        action: result.startedTracking ? 'stock.tracking-started' : 'stock.counted',
        entityType: 'stock',
        entityId: productId,
        summary: result.startedTracking
          ? `Started tracking ${result.p.name} at ${formatStock(result.balance, result.p)}`
          : `Counted ${result.p.name}: ${formatStock(result.previous, result.p)} → ${formatStock(result.balance, result.p)}`,
      });
      revalidatePath('/dashboard');
    }
    return { balance: result.balance, previous: result.previous, startedTracking: result.startedTracking, changed: result.changed };
  } catch (err) {
    return toActionError(err);
  }
}

/** The Undo on the Inventory list's "count saved" toast. Reverses exactly
 * what the count changed (`previous − counted`) rather than forcing the old
 * number back, so a sale that landed in the seconds between isn't undone
 * too. If the count is what switched tracking on and nothing has moved
 * since, tracking goes back off — staff can undo their own first count
 * without needing the owner. */
export async function undoStockCount(
  productId: string,
  undo: { previous: number; counted: number; startedTracking: boolean }
): Promise<ActionResult<{ balance: number }>> {
  try {
    const user = await requireUser();
    const delta = round6(Number(undo.previous) - Number(undo.counted));
    if (!Number.isFinite(delta)) return { error: 'Nothing to undo.' };
    const result = await prisma.$transaction(async (tx) => {
      const p = await lockProduct(tx, productId);
      const untouched = Math.abs(p.stockQty - Number(undo.counted)) < EPS;
      let balance = p.stockQty;
      if (Math.abs(delta) >= EPS) {
        const res = await applyMovement(tx, p, delta, { type: 'ADJUSTMENT', note: 'Count undone', userId: user.id }, false);
        if ('shortage' in res) throw new Error('Could not undo. Please try again.');
        balance = res.balance;
      }
      if (undo.startedTracking && untouched) await tx.product.update({ where: { id: p.id }, data: { trackStock: false } });
      return { p, balance };
    });
    await logActivity({ userId: user.id, action: 'stock.count-undone', entityType: 'stock', entityId: productId, summary: `Undid a stock count on ${result.p.name}` });
    revalidatePath('/dashboard');
    return { balance: result.balance };
  } catch (err) {
    return toActionError(err);
  }
}

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.')
  .optional()
  .nullable()
  .or(z.literal(''));

const MovementInputSchema = z.object({
  type: z.enum(['PURCHASE', 'DAMAGE', 'ADJUSTMENT', 'SALE_RETURN']),
  qty: z.coerce.number().refine((n) => Number.isFinite(n) && Math.abs(n) > EPS, 'Enter a quantity.'),
  unit: z.string().min(1, 'Pick a unit.'),
  date: dateString,
  reference: z.string().max(80).optional().nullable(),
  unitCost: z.coerce.number().min(0, 'Cost can’t be negative.').optional().nullable(),
  batchNo: z.string().max(60).optional().nullable(),
  expiryDate: dateString,
  note: z.string().max(300).optional().nullable(),
});

export type StockMovementInput = z.input<typeof MovementInputSchema>;

const MOVEMENT_VERB: Record<string, string> = { PURCHASE: 'Stock in', DAMAGE: 'Wrote off', ADJUSTMENT: 'Adjusted', SALE_RETURN: 'Customer return' };

/** A manual movement from the ledger's drawers: Stock in (PURCHASE), a
 * write-off (DAMAGE), a customer return (SALE_RETURN) or a signed
 * ADJUSTMENT. `qty` is in the chosen `unit` and converted to main units;
 * only ADJUSTMENT takes a sign, the others are always the obvious
 * direction. Anything that takes stock out can't go below zero — that's
 * what a count correction is for. */
export async function addStockMovement(productId: string, input: StockMovementInput): Promise<ActionResult<{ balance: number }>> {
  try {
    const user = await requireUser();
    const parsed = MovementInputSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
    const data = parsed.data;
    if (data.type !== 'ADJUSTMENT' && data.qty < 0) return { error: 'Enter a quantity above zero.' };

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.product.findUnique({ where: { id: productId }, select: productSelect });
      if (!row) throw new Error('This product no longer exists.');
      const p = toStockProduct(row);
      if (!p.trackStock) throw new Error(`Start tracking ${p.name} first — enter its current count on the Inventory screen.`);
      const knownUnit = stockUnits(p).some((u) => u.trim().toLowerCase() === data.unit.trim().toLowerCase());
      if (!knownUnit) throw new Error(`${p.name} isn’t sold in “${data.unit}”. Pick one of its units.`);

      const factor = unitFactor(p, data.unit);
      const mainQty = round6(Math.abs(data.qty) * factor);
      const delta =
        data.type === 'PURCHASE' || data.type === 'SALE_RETURN' ? mainQty : data.type === 'DAMAGE' ? -mainQty : Math.sign(data.qty) * mainQty;
      const isIn = data.type === 'PURCHASE';
      const res = await applyMovement(
        tx,
        p,
        delta,
        {
          type: data.type,
          date: movementDate(data.date),
          reference: cleanText(data.reference),
          // Stored per MAIN unit so the average cost is comparable across
          // stock-ins entered in different units.
          unitCost: isIn && data.unitCost != null && data.unitCost > 0 ? round6(data.unitCost / factor) : null,
          batchNo: isIn ? cleanText(data.batchNo) : null,
          expiryDate: isIn && data.expiryDate ? new Date(data.expiryDate) : null,
          note: cleanText(data.note),
          userId: user.id,
        },
        true
      );
      if ('shortage' in res) {
        throw new Error(
          `That would take ${p.name} below zero — you have ${res.shortage.have}. To set the real count instead, use “Count correction”.`
        );
      }
      return { p, delta, balance: res.balance };
    });

    const amount = formatStock(Math.abs(result.delta), result.p);
    await logActivity({
      userId: user.id,
      action: `stock.${data.type.toLowerCase()}`,
      entityType: 'stock',
      entityId: productId,
      summary: `${MOVEMENT_VERB[data.type]} ${result.delta >= 0 ? '+' : '−'}${amount} of ${result.p.name}${data.reference ? ` (bill ${data.reference})` : ''}`,
    });
    revalidatePath('/dashboard');
    return { balance: result.balance };
  } catch (err) {
    return toActionError(err);
  }
}

/** Switching tracking ON from here keeps whatever balance is on file, so the
 * screens prefer setStockCount (which asks for a real count first). Turning
 * it OFF stops invoices checking and taking stock for this product — owner
 * only, since it quietly removes the oversell guard. History is kept. */
export async function setTrackStock(productId: string, on: boolean): Promise<ActionResult> {
  try {
    const user = on ? await requireUser() : await requireOwner();
    const row = await prisma.product.findUnique({ where: { id: productId }, select: productSelect });
    if (!row) return { error: 'This product no longer exists.' };
    const p = toStockProduct(row);
    if (p.trackStock === on) return {};
    if (on && needsPackSize(p)) return { error: packSizeError(p) };
    await prisma.product.update({ where: { id: productId }, data: { trackStock: on } });
    await logActivity({
      userId: user.id,
      action: on ? 'stock.tracking-on' : 'stock.tracking-off',
      entityType: 'stock',
      entityId: productId,
      summary: `${on ? 'Resumed' : 'Stopped'} stock tracking for ${p.name}`,
    });
    revalidatePath('/dashboard');
    return {};
  } catch (err) {
    return toActionError(err);
  }
}

/** The "alert me at" level, in main units — null turns the low-stock alert off. */
export async function setLowStockLevel(productId: string, level: number | null): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const value = level == null ? null : round6(Number(level));
    if (value != null && (!Number.isFinite(value) || value < 0)) return { error: 'The alert level can’t be below zero.' };
    const p = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, unit: true } });
    if (!p) return { error: 'This product no longer exists.' };
    await prisma.product.update({ where: { id: productId }, data: { lowStockAt: value } });
    await logActivity({
      userId: user.id,
      action: 'stock.alert-level',
      entityType: 'stock',
      entityId: productId,
      summary: value == null ? `Turned off the low-stock alert for ${p.name}` : `Low-stock alert for ${p.name} set to ${value} ${p.unit}`,
    });
    revalidatePath('/dashboard');
    return {};
  } catch (err) {
    return toActionError(err);
  }
}

export type DraftHoldingStock = { id: string; number: string; customer: string; date: string; total: number; items: number; ageDays: number };
export type DraftsHoldingStock = { count: number; oldestDate: string | null; numbers: string[]; drafts: DraftHoldingStock[] };

/** Drafts holding tracked stock. Every saved draft takes its lines out, so
 * one left sitting keeps that stock off the shelf — the Inventory screen
 * and the Dashboard list them so they get sent or deleted. Oldest first. */
export async function getDraftsHoldingStock(): Promise<DraftsHoldingStock> {
  await requireUser();
  const where: Prisma.InvoiceWhereInput = { status: 'DRAFT', stockTaken: true, items: { some: { product: { is: { trackStock: true } } } } };
  const [count, oldest] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: 5,
      select: { id: true, number: true, date: true, total: true, customer: { select: { name: true, shopName: true } }, _count: { select: { items: true } } },
    }),
  ]);
  const today = istDayRangeUtc(todayIst()).gte.getTime();
  const drafts = oldest.map((d) => ({
    id: d.id,
    number: d.number,
    customer: d.customer.shopName || d.customer.name,
    date: d.date.toISOString().slice(0, 10),
    total: Number(d.total),
    items: d._count.items,
    ageDays: Math.max(0, Math.floor((today - istDayRangeUtc(d.date.toISOString().slice(0, 10)).gte.getTime()) / DAY_MS)),
  }));
  return { count, oldestDate: drafts[0]?.date ?? null, numbers: drafts.slice(0, 3).map((d) => d.number), drafts };
}

export type ReorderSuggestion = { id: string; name: string; unit: string; stockText: string; daysLeft: number; suggested: number };

/** Tracked products that still have stock but will run out within the
 * reorder lead time, with how much to order (forecast's two lead times of
 * recent sales, in the main unit) and the supplier most of them were last
 * bought from — the Inventory screen's one-tap purchase bill. Most urgent
 * first. Products already at 0 aren't listed: they're Out of stock. */
export type ReorderSuggestions = { items: ReorderSuggestion[]; supplier: { id: string; name: string; phone: string | null } | null; leadDays: number };

export async function getReorderSuggestions(): Promise<ReorderSuggestions> {
  await requireUser();
  const [company, rows] = await Promise.all([getCompany(), prisma.product.findMany({ where: { trackStock: true }, select: productSelect })]);
  const products = rows.map(toStockProduct);
  const sales = await averageDailySales(products.map((p) => p.id));
  const items = products
    .flatMap((p) => {
      const f = forecast(p, sales.get(p.id), company.reorderLeadDays);
      if (p.stockQty <= EPS || f.daysLeft == null || f.daysLeft > company.reorderLeadDays || !f.suggestedReorder) return [];
      return [{ id: p.id, name: p.name, unit: p.unit, stockText: formatStock(p.stockQty, p), daysLeft: f.daysLeft, suggested: f.suggestedReorder }];
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
  let supplier: ReorderSuggestions['supplier'] = null;
  if (items.length) {
    const last = await prisma.purchaseItem.findMany({
      where: { productId: { in: items.map((i) => i.id) } },
      orderBy: { purchase: { date: 'desc' } },
      distinct: ['productId'],
      select: { purchase: { select: { supplier: { select: { id: true, name: true, phone: true, active: true } } } } },
    });
    const tally = new Map<string, { s: NonNullable<ReorderSuggestions['supplier']>; n: number }>();
    for (const r of last) {
      const s = r.purchase.supplier;
      if (!s.active) continue;
      tally.set(s.id, { s: { id: s.id, name: s.name, phone: s.phone }, n: (tally.get(s.id)?.n ?? 0) + 1 });
    }
    supplier = [...tally.values()].sort((a, b) => b.n - a.n)[0]?.s ?? null;
  }
  return { items, supplier, leadDays: company.reorderLeadDays };
}

/** Average purchase cost per MAIN unit (ex-GST) — the invoice builder warns
 * the owner when a line sells below it. Staff get nothing: cost prices are
 * the owner's to see. */
export async function getCostsForBilling(productIds: string[]): Promise<Record<string, number>> {
  const user = await requireUser();
  if (user.role !== 'OWNER' || !productIds.length) return {};
  return Object.fromEntries(await averageCosts(productIds));
}

// ---------------------------------------------------------------------------
// One product's ledger
// ---------------------------------------------------------------------------

export type LedgerTypeGroup = 'all' | 'in' | 'sale' | 'return' | 'adjust';

const GROUP_TYPES: Record<Exclude<LedgerTypeGroup, 'all'>, StockMovementType[]> = {
  in: ['OPENING', 'PURCHASE', 'PURCHASE_RETURN'],
  sale: ['SALE'],
  return: ['SALE_RETURN'],
  adjust: ['ADJUSTMENT', 'DAMAGE'],
};

/** SALE_RETURN rows an invoice posted itself (edited down, or a draft
 * deleted) — no goods came back, so they count with sales, not returns.
 * Same rule as isInvoiceReversal in src/components/inventory/stock-meta.ts. */
const INVOICE_REVERSAL: Prisma.StockMovementWhereInput = { type: 'SALE_RETURN', creditNoteId: null, invoiceNumber: { not: null } };

const GROUP_WHERE: Record<Exclude<LedgerTypeGroup, 'all'>, Prisma.StockMovementWhereInput> = {
  in: { type: { in: GROUP_TYPES.in } },
  sale: { OR: [{ type: 'SALE' }, INVOICE_REVERSAL] },
  return: { type: 'SALE_RETURN', NOT: INVOICE_REVERSAL },
  adjust: { type: { in: GROUP_TYPES.adjust } },
};

export type LedgerMovement = {
  id: string;
  date: string;
  type: StockMovementType;
  qty: number;
  balanceAfter: number;
  reference: string | null;
  note: string | null;
  unitCost: number | null;
  batchNo: string | null;
  expiryDate: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  customerName: string | null;
  purchaseId: string | null;
  supplierName: string | null;
  creditNoteId: string | null;
  creditNoteNumber: string | null;
  userName: string | null;
};

export type StockLedger = {
  product: StockProduct & { status: StockStatus };
  movements: LedgerMovement[];
  total: number;
  pageSize: number;
  groupCounts: Record<LedgerTypeGroup, number>;
  summary: { opening: number; stockIn: number; returns: number; sold: number; writeOffs: number; closing: number; isCurrent: boolean };
  avgCost: number | null;
  batches: OnHandBatch[];
  avgDailySales: number;
  daysLeft: number | null;
  suggestedReorder: number | null;
  reorderLeadDays: number;
  expiryAlertDays: number;
};

const LEDGER_PAGE_SIZE = 25;

/** Everything the /inventory/[productId] screen shows. Movements are listed
 * in the order they were recorded (newest first) so the Balance column always
 * reads as a true running balance, even when a stock-in was back-dated; the
 * date filter still works on each row's own date. With a date range, the
 * summary cards become a statement for that period: opening = the balance
 * before it starts, closing = the balance at its end. */
export async function getStockLedger(
  productId: string,
  opts?: { type?: LedgerTypeGroup; dateFrom?: string; dateTo?: string; page?: number }
): Promise<StockLedger | null> {
  const page = Math.max(opts?.page ?? 1, 1);
  const group = opts?.type ?? 'all';
  const from = opts?.dateFrom ? istDayRangeUtc(opts.dateFrom).gte : undefined;
  const to = opts?.dateTo ? istDayRangeUtc(opts.dateTo).lt : undefined;
  const dateWhere = from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {};
  const rangeWhere: Prisma.StockMovementWhereInput = { productId, ...dateWhere };
  const listWhere: Prisma.StockMovementWhereInput = group === 'all' ? rangeWhere : { AND: [rangeWhere, GROUP_WHERE[group]] };

  const [company, row] = await Promise.all([getCompany(), prisma.product.findUnique({ where: { id: productId }, select: productSelect })]);
  if (!row) return null;
  const product = toStockProduct(row);

  const [movements, total, byType, reversals, before, costs, lots, sales] = await Promise.all([
    prisma.stockMovement.findMany({
      where: listWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * LEDGER_PAGE_SIZE,
      take: LEDGER_PAGE_SIZE,
      include: {
        user: { select: { name: true, email: true, phone: true } },
        invoice: { select: { customer: { select: { name: true, shopName: true } } } },
        purchase: { select: { supplier: { select: { name: true } } } },
        creditNote: { select: { number: true } },
      },
    }),
    prisma.stockMovement.count({ where: listWhere }),
    prisma.stockMovement.groupBy({ by: ['type'], where: rangeWhere, _sum: { qty: true }, _count: { _all: true } }),
    prisma.stockMovement.aggregate({ where: { AND: [rangeWhere, INVOICE_REVERSAL] }, _sum: { qty: true }, _count: { _all: true } }),
    from ? prisma.stockMovement.aggregate({ where: { productId, date: { lt: from } }, _sum: { qty: true } }) : null,
    averageCosts([productId]),
    loadLots([productId]),
    averageDailySales([productId]),
  ]);

  const sum = (types: StockMovementType[]) => round6(byType.filter((g) => types.includes(g.type)).reduce((s, g) => s + Number(g._sum.qty ?? 0), 0));
  const count = (types: StockMovementType[]) => byType.filter((g) => types.includes(g.type)).reduce((s, g) => s + g._count._all, 0);
  const openingBefore = before ? Number(before._sum.qty ?? 0) : 0;
  const opening = round6(openingBefore + sum(['OPENING']));
  const stockIn = sum(['PURCHASE', 'PURCHASE_RETURN']);
  // Invoice reversals reduce what was sold rather than adding a return.
  const reversed = Number(reversals._sum.qty ?? 0);
  const returns = round6(sum(['SALE_RETURN']) - reversed);
  const sold = round6(-sum(['SALE']) - reversed);
  const writeOffs = sum(['ADJUSTMENT', 'DAMAGE']);
  const ranged = !!(from || to);
  const closing = ranged ? round6(opening + stockIn + returns - sold + writeOffs) : product.stockQty;
  const f = forecast(product, sales.get(productId), company.reorderLeadDays);

  return {
    product: { ...product, status: stockStatus(product) },
    movements: movements.map((m) => ({
      id: m.id,
      date: m.date.toISOString(),
      type: m.type,
      qty: Number(m.qty),
      balanceAfter: Number(m.balanceAfter),
      reference: m.reference,
      note: m.note,
      unitCost: m.unitCost == null ? null : Number(m.unitCost),
      batchNo: m.batchNo,
      expiryDate: isoDate(m.expiryDate),
      invoiceId: m.invoiceId,
      invoiceNumber: m.invoiceNumber,
      customerName: m.invoice ? m.invoice.customer.shopName || m.invoice.customer.name : null,
      purchaseId: m.purchaseId,
      supplierName: m.purchase?.supplier.name ?? null,
      creditNoteId: m.creditNoteId,
      creditNoteNumber: m.creditNote?.number ?? null,
      userName: m.user ? m.user.name || m.user.email || m.user.phone : null,
    })),
    total,
    pageSize: LEDGER_PAGE_SIZE,
    groupCounts: {
      all: count(Object.values(GROUP_TYPES).flat()),
      in: count(GROUP_TYPES.in),
      sale: count(GROUP_TYPES.sale) + reversals._count._all,
      return: count(GROUP_TYPES.return) - reversals._count._all,
      adjust: count(GROUP_TYPES.adjust),
    },
    summary: { opening, stockIn, returns, sold, writeOffs, closing, isCurrent: !opts?.dateTo || opts.dateTo >= todayIst() },
    avgCost: costs.get(productId) ?? null,
    batches: product.trackStock ? allocateBatches(lots.get(productId), product.stockQty) : [],
    avgDailySales: f.avgDailySales,
    daysLeft: f.daysLeft,
    suggestedReorder: f.suggestedReorder,
    reorderLeadDays: company.reorderLeadDays,
    expiryAlertDays: company.expiryAlertDays,
  };
}

// ---------------------------------------------------------------------------
// Batches for the invoice builder
// ---------------------------------------------------------------------------

/** The oldest batch still on hand for each product (the one first-in-first-
 * out says goes next), for pre-filling an invoice line's batch. Products with
 * no batch-numbered stock map to null. */
export async function getOldestBatches(productIds: string[]): Promise<Record<string, { batchNo: string | null; expiryDate: string | null } | null>> {
  await requireUser();
  const ids = [...new Set(productIds.filter(Boolean))];
  const out: Record<string, { batchNo: string | null; expiryDate: string | null } | null> = Object.fromEntries(ids.map((id) => [id, null]));
  if (!ids.length) return out;
  const products = await prisma.product.findMany({ where: { id: { in: ids }, trackStock: true, stockQty: { gt: 0 } }, select: productSelect });
  const lots = await loadLots(products.map((p) => p.id));
  for (const row of products) {
    const batches = allocateBatches(lots.get(row.id), Number(row.stockQty));
    if (!batches.length) continue;
    const oldest = batches.reduce((a, b) => (b.receivedAt < a.receivedAt || (b.receivedAt === a.receivedAt && (b.expiryDate ?? '~') < (a.expiryDate ?? '~')) ? b : a));
    out[row.id] = { batchNo: oldest.batchNo, expiryDate: oldest.expiryDate };
  }
  return out;
}

/** Single-product form of getOldestBatches. */
export async function getOldestBatch(productId: string): Promise<{ batchNo: string | null; expiryDate: string | null } | null> {
  const res = await getOldestBatches([productId]);
  return res[productId] ?? null;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type InventorySummary = {
  tracked: number;
  low: number;
  out: number;
  lowItems: { id: string; name: string; status: StockStatus; stockText: string; alertText: string | null }[];
  expiring: { productId: string; name: string; batchNo: string | null; expiryDate: string; daysToExpiry: number; remainingText: string }[];
  expiringCount: number;
  stockValue: number;
  /** True when some products had no purchase cost and were valued at their selling price. */
  valuedPartlyAtPrice: boolean;
};

/** The dashboard's stock cards: how many tracked products are low or out,
 * the five closest to running out, batches expiring within the company's
 * alert window, and the value of what's on the shelf (at average purchase
 * cost, or selling price where no cost was ever recorded). */
export async function getInventorySummary(): Promise<InventorySummary> {
  const [company, rows] = await Promise.all([getCompany(), prisma.product.findMany({ where: { trackStock: true }, select: productSelect })]);
  const products = rows.map(toStockProduct);
  const { today, cutoff } = expiryWindow(company.expiryAlertDays);
  const [expiring, costs] = await Promise.all([expiringBatches(products, cutoff), averageCosts(products.filter((p) => p.stockQty > EPS).map((p) => p.id))]);

  const withStatus = products.map((p) => ({ p, status: stockStatus(p) }));
  const short = withStatus
    .filter((x) => x.status === 'out' || x.status === 'low')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'out' ? -1 : 1;
      const ra = a.p.lowStockAt ? a.p.stockQty / a.p.lowStockAt : a.p.stockQty;
      const rb = b.p.lowStockAt ? b.p.stockQty / b.p.lowStockAt : b.p.stockQty;
      return ra - rb;
    });

  const byId = new Map(products.map((p) => [p.id, p]));
  const batches = [...expiring.entries()]
    .flatMap(([id, list]) => list.map((b) => ({ p: byId.get(id)!, b })))
    .sort((a, b) => (a.b.expiryDate ?? '').localeCompare(b.b.expiryDate ?? ''));

  let stockValue = 0;
  let valuedPartlyAtPrice = false;
  for (const p of products) {
    if (p.stockQty <= EPS) continue;
    const cost = costs.get(p.id);
    if (cost == null) valuedPartlyAtPrice = true;
    stockValue += p.stockQty * (cost ?? p.price);
  }

  return {
    tracked: products.length,
    low: withStatus.filter((x) => x.status === 'low').length,
    out: withStatus.filter((x) => x.status === 'out').length,
    lowItems: short.slice(0, 5).map(({ p, status }) => ({
      id: p.id,
      name: p.name,
      status,
      stockText: formatStock(p.stockQty, p),
      alertText: p.lowStockAt != null ? formatStock(p.lowStockAt, p) : null,
    })),
    expiring: batches.slice(0, 5).map(({ p, b }) => ({
      productId: p.id,
      name: p.name,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate!,
      daysToExpiry: Math.round((new Date(b.expiryDate!).getTime() - today.getTime()) / DAY_MS),
      remainingText: formatStock(b.remaining, p),
    })),
    expiringCount: batches.length,
    stockValue: Math.round(stockValue * 100) / 100,
    valuedPartlyAtPrice,
  };
}
