'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { istDayRangeUtc, todayIst } from '@/lib/dates';
import { STATUS_ORDER, STATUS_LABEL } from '@/lib/report-status';
import { formatStock, round6, unitFactor } from '@/lib/stock-units';
import { averagePurchaseCosts, loadProductMeta } from '@/app/(app)/reports/report-data';
import { loadLoadingSheet, normalizeLoadingParams, type LoadingSheet } from '@/app/(app)/reports/loading-sheet/loading-sheet-data';

// Every report here is a SQL aggregate over Invoice's stored totals columns
// (see schema.prisma / src/lib/invoice-totals.ts) — none of them load
// invoice rows, items, or payments into memory. Sums are cast to float8 and
// counts to int so they arrive as plain JS numbers rather than Decimal/
// BigInt.

/** Shared filter shape for every Reports query below — a date range (IST
 * calendar dates, see src/lib/dates.ts), an optional single customer, and
 * an optional status narrower than the blanket "exclude drafts" rule most
 * reports apply. All optional so no-args callers (the dashboard) work. */
export type ReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  status?: 'all' | 'SENT' | 'PARTIALLY_PAID' | 'PAID';
};

/** Conditions on `"Invoice" i` for the given filters. */
function filterConds(filters: ReportFilters | undefined, { excludeDrafts }: { excludeDrafts: boolean }): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [];
  if (excludeDrafts) conds.push(Prisma.sql`i.status <> 'DRAFT'`);
  if (filters?.customerId) conds.push(Prisma.sql`i."customerId" = ${filters.customerId}`);
  if (filters?.status && filters.status !== 'all') conds.push(Prisma.sql`i.status = ${filters.status}::"InvoiceStatus"`);
  if (filters?.dateFrom) conds.push(Prisma.sql`i.date >= ${istDayRangeUtc(filters.dateFrom).gte}`);
  if (filters?.dateTo) conds.push(Prisma.sql`i.date < ${istDayRangeUtc(filters.dateTo).lt}`);
  return conds;
}

function whereSql(conds: Prisma.Sql[]): Prisma.Sql {
  return conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
}

export async function getDashboardStats() {
  await requireUser();
  const now = new Date();
  const [[summary], activeProducts, customerCount, recent] = await Promise.all([
    prisma.$queryRaw<{ totalInvoiced: number; outstanding: number; collected: number; overdueCount: number; overdueTotal: number }[]>`
      SELECT
        COALESCE(SUM(total), 0)::float8 AS "totalInvoiced",
        COALESCE(SUM(GREATEST(total - "amountPaid", 0)), 0)::float8 AS "outstanding",
        COALESCE(SUM("amountPaid"), 0)::float8 AS "collected",
        (COUNT(*) FILTER (WHERE status <> 'PAID' AND due < ${now}))::int AS "overdueCount",
        COALESCE(SUM(GREATEST(total - "amountPaid", 0)) FILTER (WHERE status <> 'PAID' AND due < ${now}), 0)::float8 AS "overdueTotal"
      FROM "Invoice"
    `,
    prisma.product.count({ where: { active: true } }),
    prisma.customer.count({ where: { guest: false } }),
    prisma.invoice.findMany({
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      take: 8,
      select: { id: true, number: true, date: true, due: true, status: true, total: true, customer: { select: { name: true, shopName: true } } },
    }),
  ]);

  return {
    ...summary,
    activeProducts,
    customerCount,
    recent: recent.map((r) => ({ ...r, total: Number(r.total), isOverdue: r.status !== 'PAID' && r.due < now })),
  };
}

export async function getReportStats(filters?: ReportFilters) {
  await requireUser();
  const [row] = await prisma.$queryRaw<{ taxable: number; cgst: number; sgst: number; igst: number; total: number; outstanding: number; invoiceCount: number }[]>`
    SELECT
      COALESCE(SUM(i.taxable), 0)::float8 AS "taxable",
      COALESCE(SUM(i.cgst), 0)::float8 AS "cgst",
      COALESCE(SUM(i.sgst), 0)::float8 AS "sgst",
      COALESCE(SUM(i.igst), 0)::float8 AS "igst",
      COALESCE(SUM(i.total), 0)::float8 AS "total",
      COALESCE(SUM(GREATEST(i.total - i."amountPaid", 0)), 0)::float8 AS "outstanding",
      COUNT(*)::int AS "invoiceCount"
    FROM "Invoice" i
    ${whereSql(filterConds(filters, { excludeDrafts: true }))}
  `;
  return row;
}

/** Shifts a `[from, to]` IST calendar-date range back to the immediately
 * preceding period of the same length (inclusive day count) — e.g.
 * 2026-09-01..2026-09-22 (22 days) becomes 2026-08-10..2026-08-31. Used for
 * the Reports stat cards' "vs previous period" comparison. Plain calendar-
 * day arithmetic on the date strings (parsed at a fixed UTC noon so DST-
 * free date math never lands on the wrong day) — no need for IST-instant
 * precision here, only day counts. */
function shiftToPreviousPeriod(fromStr: string, toStr: string): { from: string; to: string } {
  const from = new Date(`${fromStr}T12:00:00Z`);
  const to = new Date(`${toStr}T12:00:00Z`);
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const prevTo = new Date(from.getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}

/** Stats for the period immediately preceding the given filters' date
 * range — powers the Reports page's "vs previous period" comparison badges.
 * Only meaningful for an actual bounded range; `null` for "All time" (or
 * any filter set with an open-ended date), since there's no well-defined
 * "period before all of history". */
export async function getPreviousPeriodStats(filters?: ReportFilters) {
  if (!filters?.dateFrom || !filters?.dateTo) return null;
  const prev = shiftToPreviousPeriod(filters.dateFrom, filters.dateTo);
  return getReportStats({ ...filters, dateFrom: prev.from, dateTo: prev.to });
}

export type TrendPoint = { key: string; label: string; billed: number; collected: number };

const DAY_MS = 86_400_000;

/** Billing (and collection) trend, bucketed by day when the filtered range
 * spans a month or less (so a "This week"/"This month" filter shows real
 * daily movement instead of one flat monthly bar) and by calendar month
 * otherwise — defaulting to the last 6 months for "All time" (unbounded) or
 * no filter. Labels are pre-formatted server-side so the chart component
 * needs no date parsing. `collected` only counts payments on invoices that
 * themselves pass the current filters (customer/status/date), so a filtered
 * view stays internally consistent. Invoice and payment dates are stored as
 * UTC midnight of their calendar date, so to_char() on them yields that
 * calendar date directly. */
export async function getBillingTrend(filters?: ReportFilters): Promise<TrendPoint[]> {
  await requireUser();

  let granularity: 'day' | 'month' = 'month';
  let buckets: { key: string; label: string }[] = [];
  let rangeStart: Date;
  let rangeEnd: Date;

  const fromD = filters?.dateFrom ? new Date(`${filters.dateFrom}T12:00:00Z`) : null;
  const toD = filters?.dateTo ? new Date(`${filters.dateTo}T12:00:00Z`) : null;
  const spanDays = fromD && toD ? Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / DAY_MS) + 1) : Infinity;

  if (fromD && spanDays <= 31) {
    granularity = 'day';
    const days = Array.from({ length: spanDays }, (_, i) => new Date(fromD.getTime() + i * DAY_MS));
    buckets = days.map((d) => ({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) }));
    rangeStart = new Date(`${buckets[0].key}T00:00:00Z`);
    rangeEnd = new Date(new Date(`${buckets[buckets.length - 1].key}T00:00:00Z`).getTime() + DAY_MS);
  } else {
    // Month-bucketed — the filtered range's own months when bounded (so
    // e.g. "This year" shows Jan..current month), else the last 6 calendar
    // months ending this month.
    let monthStarts: Date[];
    if (fromD && toD) {
      monthStarts = [];
      const cursor = new Date(Date.UTC(fromD.getUTCFullYear(), fromD.getUTCMonth(), 1));
      const last = new Date(Date.UTC(toD.getUTCFullYear(), toD.getUTCMonth(), 1));
      while (cursor.getTime() <= last.getTime()) {
        monthStarts.push(new Date(cursor));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    } else {
      const now = new Date();
      monthStarts = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(now.getFullYear(), now.getMonth() - (5 - i), 1)));
    }
    buckets = monthStarts.map((d) => ({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    }));
    const lastStart = monthStarts[monthStarts.length - 1];
    rangeStart = monthStarts[0];
    rangeEnd = new Date(Date.UTC(lastStart.getUTCFullYear(), lastStart.getUTCMonth() + 1, 1));
  }

  const fmt = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
  const conds = filterConds(filters, { excludeDrafts: true });
  const [billedRows, collectedRows] = await Promise.all([
    prisma.$queryRaw<{ key: string; amount: number }[]>`
      SELECT to_char(i.date, ${fmt}) AS "key", SUM(i.total)::float8 AS "amount"
      FROM "Invoice" i
      ${whereSql([...conds, Prisma.sql`i.date >= ${rangeStart}`, Prisma.sql`i.date < ${rangeEnd}`])}
      GROUP BY 1
    `,
    prisma.$queryRaw<{ key: string; amount: number }[]>`
      SELECT to_char(p.date, ${fmt}) AS "key", SUM(p.amount)::float8 AS "amount"
      FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
      ${whereSql([...conds, Prisma.sql`p.date >= ${rangeStart}`, Prisma.sql`p.date < ${rangeEnd}`])}
      GROUP BY 1
    `,
  ]);

  const billed = new Map(billedRows.map((r) => [r.key, r.amount]));
  const collected = new Map(collectedRows.map((r) => [r.key, r.amount]));
  return buckets.map((b) => ({ key: b.key, label: b.label, billed: billed.get(b.key) ?? 0, collected: collected.get(b.key) ?? 0 }));
}

export type StatusBreakdownPoint = { status: string; label: string; count: number; total: number };

/** How the current filtered set of invoices splits by status — unlike
 * every other report query here, this deliberately does NOT drop drafts:
 * the point of this one is to show the full pipeline (including what's
 * still in progress), not just realized billing. */
export async function getStatusBreakdown(filters?: ReportFilters): Promise<StatusBreakdownPoint[]> {
  await requireUser();
  const now = new Date();
  const rows = await prisma.$queryRaw<{ status: string; count: number; total: number }[]>`
    SELECT
      CASE WHEN i.status <> 'PAID' AND i.due < ${now} THEN 'OVERDUE' ELSE i.status::text END AS "status",
      COUNT(*)::int AS "count",
      COALESCE(SUM(i.total), 0)::float8 AS "total"
    FROM "Invoice" i
    ${whereSql(filterConds(filters, { excludeDrafts: false }))}
    GROUP BY 1
  `;
  const byStatus = new Map(rows.map((r) => [r.status, r]));
  return STATUS_ORDER.filter((k) => byStatus.has(k)).map((k) => ({ status: k, label: STATUS_LABEL[k], count: byStatus.get(k)!.count, total: byStatus.get(k)!.total }));
}

export type TopProduct = {
  key: string;
  name: string;
  /** Main units (see src/lib/stock-units.ts) — or the line's own unit for
   * ad-hoc lines, which have no product to convert through. */
  qty: number;
  /** "4 Box + 6 Pc" — formatted server-side so the chart needs no tiers. */
  qtyLabel: string;
  /** Pre-tax value after line AND invoice-level discounts, less credit
   * notes in the same period. */
  revenue: number;
};

export type TopProducts = { byValue: TopProduct[]; byQty: TopProduct[] };

/** Best-selling products across the filtered invoice set, ranked two ways:
 * by sales value and by quantity in main units ("how many boxes went out"),
 * which is what the owner actually reorders by. Custom/ad-hoc line items
 * (no productId) are grouped by name + unit. */
export async function getTopProducts(filters?: ReportFilters, limit = 8): Promise<TopProducts> {
  await requireUser();
  const { rows, products } = await salesByProduct(filters);
  const list: TopProduct[] = rows.map((r) => ({
    key: r.key,
    name: r.name,
    qty: r.mainQty,
    qtyLabel: r.productId && products.get(r.productId) ? formatStock(r.mainQty, products.get(r.productId)!) : `${trim2(r.mainQty)} ${r.unit}`,
    revenue: r.revenue,
  }));
  return {
    byValue: [...list].sort((a, b) => b.revenue - a.revenue).slice(0, limit),
    byQty: [...list].filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, limit),
  };
}

function trim2(n: number) {
  return String(Math.round(n * 100) / 100);
}

type ProductSales = {
  key: string;
  productId: string | null;
  name: string;
  category: string;
  /** Ad-hoc lines only — the unit their qty is in. */
  unit: string;
  /** Net of credit notes: sales − returns, pre-tax. */
  revenue: number;
  /** Main units sold (ad-hoc: own unit). */
  mainQty: number;
  /** Main units that came back into stock on credit notes. */
  restockedQty: number;
};

/** Sales per product for the filtered (non-draft) invoices, net of credit
 * notes in the same period/customer.
 *
 * Revenue is the line value with the invoice's overall discount spread
 * across its lines pro rata (line × invoice taxable ÷ Σ lines), so it adds
 * up to the invoices' taxable value exactly. Quantity is the line's
 * main-unit snapshot (InvoiceItem.stockQty), converted through the
 * product's current units for older lines that don't have one. */
async function salesByProduct(filters?: ReportFilters) {
  const lineSql = (conds: Prisma.Sql[]) => Prisma.sql`
    WITH l AS (
      SELECT
        it."productId",
        it.name,
        it.unit,
        it.qty,
        it."stockQty",
        it.qty * it.rate * (1 - it.discount / 100) AS line,
        i.taxable AS "docTaxable",
        SUM(it.qty * it.rate * (1 - it.discount / 100)) OVER (PARTITION BY it."invoiceId") AS "docSub"
      FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId"
      ${whereSql(conds)}
    )
    SELECT
      COALESCE("productId", 'custom:' || lower(name) || '|' || lower(unit)) AS "key",
      "productId",
      MAX(name) AS "name",
      unit AS "unit",
      COALESCE(SUM("stockQty"), 0)::float8 AS "stockQty",
      COALESCE(SUM(qty) FILTER (WHERE "stockQty" IS NULL), 0)::float8 AS "qtyNoSnapshot",
      COALESCE(SUM(CASE WHEN "docSub" > 0 THEN line * "docTaxable" / "docSub" ELSE 0 END), 0)::float8 AS "revenue"
    FROM l
    GROUP BY 1, 2, 4
  `;

  type LineAgg = { key: string; productId: string | null; name: string; unit: string; stockQty: number; qtyNoSnapshot: number; revenue: number };

  const creditConds = creditNoteConds(filters);
  const [saleRows, returnRows] = await Promise.all([
    prisma.$queryRaw<LineAgg[]>(lineSql(filterConds(filters, { excludeDrafts: true }))),
    prisma.$queryRaw<(LineAgg & { restockedStockQty: number; restockedNoSnapshot: number })[]>`
      WITH l AS (
        SELECT
          ci."productId",
          ci.name,
          ci.unit,
          ci.qty,
          ci."stockQty",
          cn.restock,
          ci.qty * ci.rate * (1 - ci.discount / 100) AS line,
          cn.taxable AS "docTaxable",
          SUM(ci.qty * ci.rate * (1 - ci.discount / 100)) OVER (PARTITION BY ci."creditNoteId") AS "docSub"
        FROM "CreditNoteItem" ci JOIN "CreditNote" cn ON cn.id = ci."creditNoteId"
        ${whereSql(creditConds)}
      )
      SELECT
        COALESCE("productId", 'custom:' || lower(name) || '|' || lower(unit)) AS "key",
        "productId",
        MAX(name) AS "name",
        unit AS "unit",
        COALESCE(SUM("stockQty"), 0)::float8 AS "stockQty",
        COALESCE(SUM(qty) FILTER (WHERE "stockQty" IS NULL), 0)::float8 AS "qtyNoSnapshot",
        COALESCE(SUM("stockQty") FILTER (WHERE restock), 0)::float8 AS "restockedStockQty",
        COALESCE(SUM(qty) FILTER (WHERE restock AND "stockQty" IS NULL), 0)::float8 AS "restockedNoSnapshot",
        COALESCE(SUM(CASE WHEN "docSub" > 0 THEN line * "docTaxable" / "docSub" ELSE 0 END), 0)::float8 AS "revenue"
      FROM l
      GROUP BY 1, 2, 4
    `,
  ]);

  const ids = [...new Set([...saleRows, ...returnRows].map((r) => r.productId).filter((id): id is string => !!id))];
  const products = await loadProductMeta(ids);
  const toMain = (productId: string | null, unit: string, stockQty: number, noSnapshot: number) => {
    const p = productId ? products.get(productId) : undefined;
    return round6(stockQty + (p ? noSnapshot * unitFactor(p, unit) : noSnapshot));
  };

  const byKey = new Map<string, ProductSales>();
  const entry = (r: LineAgg) => {
    const p = r.productId ? products.get(r.productId) : undefined;
    let e = byKey.get(r.key);
    if (!e) {
      e = { key: r.key, productId: r.productId, name: p?.name ?? r.name, category: p?.category ?? '', unit: r.unit, revenue: 0, mainQty: 0, restockedQty: 0 };
      byKey.set(r.key, e);
    }
    return e;
  };
  for (const r of saleRows) {
    const e = entry(r);
    e.revenue += r.revenue;
    e.mainQty = round6(e.mainQty + toMain(r.productId, r.unit, r.stockQty, r.qtyNoSnapshot));
  }
  for (const r of returnRows) {
    const e = entry(r);
    e.revenue -= r.revenue;
    e.restockedQty = round6(e.restockedQty + toMain(r.productId, r.unit, r.restockedStockQty, r.restockedNoSnapshot));
  }
  return { rows: [...byKey.values()], products };
}

/** Conditions on `"CreditNote" cn` — the date range and customer from the
 * report filters. Credit notes have no status, so the status filter
 * doesn't apply to them. */
function creditNoteConds(filters: ReportFilters | undefined): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [];
  if (filters?.customerId) conds.push(Prisma.sql`cn."customerId" = ${filters.customerId}`);
  if (filters?.dateFrom) conds.push(Prisma.sql`cn.date >= ${istDayRangeUtc(filters.dateFrom).gte}`);
  if (filters?.dateTo) conds.push(Prisma.sql`cn.date < ${istDayRangeUtc(filters.dateTo).lt}`);
  return conds;
}

/** Payments collected per calendar month for the last `months` months
 * (dashboard sparkline). */
export async function getCollectedTrend(months = 6) {
  await requireUser();
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const start = new Date(`${keys[0]}-01T00:00:00Z`);
  const rows = await prisma.$queryRaw<{ key: string; total: number }[]>`
    SELECT to_char(p.date, 'YYYY-MM') AS "key", SUM(p.amount)::float8 AS "total"
    FROM "Payment" p
    WHERE p.date >= ${start}
    GROUP BY 1
  `;
  const byKey = new Map(rows.map((r) => [r.key, r.total]));
  return keys.map((key) => ({ month: key, total: byKey.get(key) ?? 0 }));
}

export async function getMonthOverMonth() {
  await requireUser();
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;
  const [row] = await prisma.$queryRaw<{ thisMonthTotal: number; lastMonthTotal: number }[]>`
    SELECT
      COALESCE(SUM(total) FILTER (WHERE to_char(date, 'YYYY-MM') = ${thisKey}), 0)::float8 AS "thisMonthTotal",
      COALESCE(SUM(total) FILTER (WHERE to_char(date, 'YYYY-MM') = ${lastKey}), 0)::float8 AS "lastMonthTotal"
    FROM "Invoice"
    WHERE date >= ${new Date(`${lastKey}-01T00:00:00Z`)}
  `;
  return {
    thisMonthLabel: now.toLocaleDateString('en-IN', { month: 'long' }),
    lastMonthLabel: lastDate.toLocaleDateString('en-IN', { month: 'long' }),
    thisMonthTotal: row.thisMonthTotal,
    lastMonthTotal: row.lastMonthTotal,
  };
}

/** Customers ranked by billed total across the filtered (non-draft)
 * invoices. `limit` caps the list (the dashboard's quick-access row);
 * Reports passes none and gets every billed customer. */
export async function getTopCustomers(filters?: ReportFilters, limit?: number) {
  await requireUser();
  return prisma.$queryRaw<{ name: string; shopName: string | null; state: string; total: number; balance: number; count: number }[]>`
    SELECT
      c.name AS "name",
      c."shopName" AS "shopName",
      c.state AS "state",
      SUM(i.total)::float8 AS "total",
      SUM(GREATEST(i.total - i."amountPaid", 0))::float8 AS "balance",
      COUNT(*)::int AS "count"
    FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
    ${whereSql(filterConds(filters, { excludeDrafts: true }))}
    GROUP BY c.id
    ORDER BY "total" DESC
    ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  `;
}

// ---------------------------------------------------------------------------
// GST summary
// ---------------------------------------------------------------------------

export type TaxHeads = { taxable: number; cgst: number; sgst: number; igst: number; count: number };

export type GstSummary = {
  /** Output tax on issued (non-draft) invoices. */
  sales: TaxHeads;
  /** Credit notes in the period — reduce output tax. */
  returns: TaxHeads;
  /** Input tax on supplier bills. Null when the report is narrowed to one
   * customer: purchases aren't per customer, so "net payable" for one
   * customer would be meaningless. */
  input: TaxHeads | null;
  /** Taxable value of the sales above, split by whether the buyer has a
   * GSTIN (B2B, goes in GSTR-1 invoice-wise) or not (B2C, summarised). */
  b2b: { taxable: number; count: number };
  b2c: { taxable: number; count: number };
};

/** The period's GST position: output tax (invoices − credit notes) less
 * input tax (purchases) — the same arithmetic as GSTR-3B, as a quick check
 * before the accountant files. Uses the date range and customer filter but
 * deliberately not the status filter: GST is owed on an invoice when it's
 * issued, paid or not. */
export async function getGstSummary(filters?: ReportFilters): Promise<GstSummary> {
  await requireUser();
  const range = { dateFrom: filters?.dateFrom, dateTo: filters?.dateTo, customerId: filters?.customerId };

  const purchaseConds: Prisma.Sql[] = [];
  if (range.dateFrom) purchaseConds.push(Prisma.sql`p.date >= ${istDayRangeUtc(range.dateFrom).gte}`);
  if (range.dateTo) purchaseConds.push(Prisma.sql`p.date < ${istDayRangeUtc(range.dateTo).lt}`);

  const heads = (alias: string) =>
    Prisma.raw(`
      COALESCE(SUM(${alias}.taxable), 0)::float8 AS "taxable",
      COALESCE(SUM(${alias}.cgst), 0)::float8 AS "cgst",
      COALESCE(SUM(${alias}.sgst), 0)::float8 AS "sgst",
      COALESCE(SUM(${alias}.igst), 0)::float8 AS "igst",
      COUNT(*)::int AS "count"`);

  const [[sales], [returns], input] = await Promise.all([
    prisma.$queryRaw<(TaxHeads & { b2bTaxable: number; b2bCount: number })[]>`
      SELECT ${heads('i')},
        COALESCE(SUM(i.taxable) FILTER (WHERE COALESCE(c.gstin, '') <> ''), 0)::float8 AS "b2bTaxable",
        (COUNT(*) FILTER (WHERE COALESCE(c.gstin, '') <> ''))::int AS "b2bCount"
      FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
      ${whereSql(filterConds(range, { excludeDrafts: true }))}
    `,
    prisma.$queryRaw<TaxHeads[]>`
      SELECT ${heads('cn')} FROM "CreditNote" cn ${whereSql(creditNoteConds(range))}
    `,
    range.customerId
      ? Promise.resolve(null)
      : prisma.$queryRaw<TaxHeads[]>`SELECT ${heads('p')} FROM "Purchase" p ${whereSql(purchaseConds)}`.then((r) => r[0]),
  ]);

  const { b2bTaxable, b2bCount, ...salesHeads } = sales;
  return {
    sales: salesHeads,
    returns,
    input,
    b2b: { taxable: b2bTaxable, count: b2bCount },
    b2c: { taxable: salesHeads.taxable - b2bTaxable, count: salesHeads.count - b2bCount },
  };
}

// ---------------------------------------------------------------------------
// Profit estimate
// ---------------------------------------------------------------------------

export type ProfitRow = { key: string; name: string; revenue: number; cost: number; profit: number; margin: number; qtyLabel: string };

export type ProfitEstimate = {
  /** Net sales (pre-tax, after credit notes) across every product. */
  revenue: number;
  /** The part of `revenue` whose products have a known purchase cost. */
  knownRevenue: number;
  cost: number;
  profit: number;
  /** profit ÷ knownRevenue, as a fraction. Null when nothing is costed. */
  margin: number | null;
  unknown: { products: number; revenue: number; share: number };
  top: ProfitRow[];
};

/** Gross profit estimate for the filtered invoices: net sales − cost of
 * goods sold, where cost = each product's weighted average purchase cost
 * per main unit (src/app/(app)/reports/report-data.ts) × main units sold,
 * less any that came back into stock on a credit note. Products with no
 * purchase cost on file are kept out of the profit figure entirely (not
 * counted as zero-cost, which would overstate profit) and reported as
 * "cost unknown" so the owner knows the figure is partial. */
export async function getProfitEstimate(filters?: ReportFilters, limit = 8): Promise<ProfitEstimate> {
  await requireUser();
  const { rows, products } = await salesByProduct(filters);
  const costs = await averagePurchaseCosts(products);

  let revenue = 0;
  let knownRevenue = 0;
  let cost = 0;
  let unknownRevenue = 0;
  let unknownProducts = 0;
  const costed: ProfitRow[] = [];

  for (const r of rows) {
    revenue += r.revenue;
    const unitCost = r.productId ? costs.get(r.productId) : undefined;
    if (unitCost === undefined) {
      if (r.revenue > 0.004 || r.mainQty > 0) {
        unknownProducts++;
        unknownRevenue += Math.max(r.revenue, 0);
      }
      continue;
    }
    const netQty = Math.max(r.mainQty - r.restockedQty, 0);
    const lineCost = unitCost * netQty;
    knownRevenue += r.revenue;
    cost += lineCost;
    const p = r.productId ? products.get(r.productId) : undefined;
    costed.push({
      key: r.key,
      name: r.name,
      revenue: r.revenue,
      cost: lineCost,
      profit: r.revenue - lineCost,
      margin: r.revenue > 0 ? (r.revenue - lineCost) / r.revenue : 0,
      qtyLabel: p ? formatStock(netQty, p) : String(netQty),
    });
  }

  const profit = knownRevenue - cost;
  return {
    revenue,
    knownRevenue,
    cost,
    profit,
    margin: knownRevenue > 0 ? profit / knownRevenue : null,
    unknown: { products: unknownProducts, revenue: unknownRevenue, share: revenue > 0 ? unknownRevenue / revenue : 0 },
    top: costed.sort((a, b) => b.profit - a.profit).slice(0, limit),
  };
}

// ---------------------------------------------------------------------------
// Daily loading sheet
// ---------------------------------------------------------------------------

/** One day's loading sheet (load list + drop list per vehicle or route) —
 * see src/app/(app)/reports/loading-sheet/loading-sheet-data.ts. Input is
 * normalised there, so a hand-edited URL can't break the query. */
export async function getLoadingSheet(input: { date?: string; group?: string; includeDrafts?: boolean }): Promise<LoadingSheet> {
  await requireUser();
  return loadLoadingSheet(normalizeLoadingParams({ date: input.date, group: input.group, drafts: input.includeDrafts ?? false }, todayIst()));
}
