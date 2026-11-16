import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { currentCompanyId } from '@/lib/tenant';
import { istDayRangeUtc, todayIst } from '@/lib/dates';
import { customerDisplayName } from '@/lib/customer';
import { STATUS_ORDER, STATUS_LABEL } from '@/lib/report-status';
import { formatStock, round6, stockStatus, unitFactor, unitLabel, type StockStatus } from '@/lib/stock-units';
import { averagePurchaseCosts, loadProductMeta } from './report-data';

// The Reports SQL — every query behind src/actions/reports.ts, plus the
// monthly report PDF's print page (src/app/print/monthly-report), which has
// no session (the headless renderer reaches it with a signed token).
// Deliberately NOT in the actions file: every exported async function in a
// 'use server' file becomes a public endpoint, and these skip the session
// check — their callers (the actions, the token-checked print page) have
// already done it. Server-only.
//
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
  /** The period to compare against, when the caller has one (the shared
   * date picker's — "the same days of October" — so Reports and the
   * Dashboard compare alike). Without it, the equal-length period just
   * before. */
  compareFrom?: string;
  compareTo?: string;
};

/** Conditions on `"Invoice" i` for the given filters. */
/** `<alias>."companyId" = <company in scope>` — first in every WHERE below.
 * Raw SQL bypasses the scoped client's automatic filter (src/lib/tenant-scope.ts). */
async function tenantCond(alias: string): Promise<Prisma.Sql> {
  return Prisma.sql`${Prisma.raw(alias)}."companyId" = ${await currentCompanyId()}`;
}

async function filterConds(filters: ReportFilters | undefined, { excludeDrafts }: { excludeDrafts: boolean }): Promise<Prisma.Sql[]> {
  const conds: Prisma.Sql[] = [await tenantCond('i')];
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

/** The headline figures: issued invoices (sent, part-paid, paid) for the
 * filters — totals, GST split, what's still owed and the overdue part of it
 * — plus the drafts for the same dates and customer, kept apart so the
 * page can add them in only when asked ("Include drafts"). */
export async function queryReportStats(filters?: ReportFilters) {
  const todayStart = istDayRangeUtc(todayIst()).gte;
  const draftConds: Prisma.Sql[] = [await tenantCond('i'), Prisma.sql`i.status = 'DRAFT'`];
  if (filters?.customerId) draftConds.push(Prisma.sql`i."customerId" = ${filters.customerId}`);
  if (filters?.dateFrom) draftConds.push(Prisma.sql`i.date >= ${istDayRangeUtc(filters.dateFrom).gte}`);
  if (filters?.dateTo) draftConds.push(Prisma.sql`i.date < ${istDayRangeUtc(filters.dateTo).lt}`);
  const [[row], [draft]] = await Promise.all([
    prisma.$queryRaw<
      { taxable: number; cgst: number; sgst: number; igst: number; total: number; outstanding: number; overdue: number; overdueCount: number; invoiceCount: number }[]
    >`
      SELECT
        COALESCE(SUM(i.taxable), 0)::float8 AS "taxable",
        COALESCE(SUM(i.cgst), 0)::float8 AS "cgst",
        COALESCE(SUM(i.sgst), 0)::float8 AS "sgst",
        COALESCE(SUM(i.igst), 0)::float8 AS "igst",
        COALESCE(SUM(i.total), 0)::float8 AS "total",
        COALESCE(SUM(GREATEST(i.total - i."amountPaid", 0)), 0)::float8 AS "outstanding",
        COALESCE(SUM(GREATEST(i.total - i."amountPaid", 0)) FILTER (WHERE i.status IN ('SENT', 'PARTIALLY_PAID') AND i.due < ${todayStart}), 0)::float8 AS "overdue",
        (COUNT(*) FILTER (WHERE i.status IN ('SENT', 'PARTIALLY_PAID') AND i.due < ${todayStart} AND i.total - i."amountPaid" > 0.004))::int AS "overdueCount",
        COUNT(*)::int AS "invoiceCount"
      FROM "Invoice" i
      ${whereSql(await filterConds(filters, { excludeDrafts: true }))}
    `,
    prisma.$queryRaw<{ drafts: number; draftCount: number }[]>`
      SELECT COALESCE(SUM(i.total), 0)::float8 AS "drafts", COUNT(*)::int AS "draftCount"
      FROM "Invoice" i
      ${whereSql(draftConds)}
    `,
  ]);
  return { ...row, ...draft };
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
export async function queryPreviousPeriodStats(filters?: ReportFilters) {
  const prev = previousRange(filters);
  if (!prev) return null;
  return queryReportStats({ ...filters, dateFrom: prev.from, dateTo: prev.to });
}

export type TrendPoint = { key: string; label: string; billed: number; collected: number };

const DAY_MS = 86_400_000;

type TrendBuckets = {
  granularity: 'day' | 'month';
  buckets: { key: string; label: string }[];
  /** `[rangeStart, rangeEnd)` covers every bucket, as stored-date instants. */
  rangeStart: Date;
  rangeEnd: Date;
};

/** The x-axis every trend on the Reports page shares: one bucket per day
 * when the filtered range spans a month or less (so a "This week"/"This
 * month" filter shows real daily movement instead of one flat monthly bar)
 * and per calendar month otherwise — the range's own months when bounded
 * (so "This year" shows Jan..current month), else the last 6 calendar
 * months ending this month. Labels are pre-formatted here so the chart
 * components need no date parsing. Invoice and payment dates are stored as
 * UTC midnight of their calendar date, so to_char() on them yields that
 * calendar date directly and matches these keys. */
function trendBuckets(filters?: ReportFilters): TrendBuckets {
  const fromD = filters?.dateFrom ? new Date(`${filters.dateFrom}T12:00:00Z`) : null;
  const toD = filters?.dateTo ? new Date(`${filters.dateTo}T12:00:00Z`) : null;
  const spanDays = fromD && toD ? Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / DAY_MS) + 1) : Infinity;

  if (fromD && spanDays <= 31) {
    const days = Array.from({ length: spanDays }, (_, i) => new Date(fromD.getTime() + i * DAY_MS));
    const buckets = days.map((d) => ({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) }));
    return {
      granularity: 'day',
      buckets,
      rangeStart: new Date(`${buckets[0].key}T00:00:00Z`),
      rangeEnd: new Date(new Date(`${buckets[buckets.length - 1].key}T00:00:00Z`).getTime() + DAY_MS),
    };
  }

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
  const lastStart = monthStarts[monthStarts.length - 1];
  return {
    granularity: 'month',
    buckets: monthStarts.map((d) => ({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    })),
    rangeStart: monthStarts[0],
    rangeEnd: new Date(Date.UTC(lastStart.getUTCFullYear(), lastStart.getUTCMonth() + 1, 1)),
  };
}

/** Billing (and collection) trend over trendBuckets' days or months.
 * `collected` only counts payments on invoices that themselves pass the
 * current filters (customer/status/date), so a filtered view stays
 * internally consistent — the Collections tab's own trend (queryCollections)
 * is the one that counts every payment received in the period instead. */
export async function queryBillingTrend(filters?: ReportFilters): Promise<TrendPoint[]> {
  const { granularity, buckets, rangeStart, rangeEnd } = trendBuckets(filters);

  const fmt = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
  const conds = await filterConds(filters, { excludeDrafts: true });
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
export async function queryStatusBreakdown(filters?: ReportFilters): Promise<StatusBreakdownPoint[]> {
  const now = new Date();
  const rows = await prisma.$queryRaw<{ status: string; count: number; total: number }[]>`
    SELECT
      CASE WHEN i.status <> 'PAID' AND i.due < ${now} THEN 'OVERDUE' ELSE i.status::text END AS "status",
      COUNT(*)::int AS "count",
      COALESCE(SUM(i.total), 0)::float8 AS "total"
    FROM "Invoice" i
    ${whereSql(await filterConds(filters, { excludeDrafts: false }))}
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
export async function queryTopProducts(filters?: ReportFilters, limit = 8): Promise<TopProducts> {
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

  const creditConds = await creditNoteConds(filters);
  const [saleRows, returnRows] = await Promise.all([
    prisma.$queryRaw<LineAgg[]>(lineSql(await filterConds(filters, { excludeDrafts: true }))),
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
async function creditNoteConds(filters: ReportFilters | undefined): Promise<Prisma.Sql[]> {
  const conds: Prisma.Sql[] = [await tenantCond('cn')];
  if (filters?.customerId) conds.push(Prisma.sql`cn."customerId" = ${filters.customerId}`);
  if (filters?.dateFrom) conds.push(Prisma.sql`cn.date >= ${istDayRangeUtc(filters.dateFrom).gte}`);
  if (filters?.dateTo) conds.push(Prisma.sql`cn.date < ${istDayRangeUtc(filters.dateTo).lt}`);
  return conds;
}

/** Payments collected per calendar month for the last `months` months
 * (dashboard sparkline). */
export async function queryCollectedTrend(months = 6) {
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
    WHERE p."companyId" = ${await currentCompanyId()} AND p.date >= ${start}
    GROUP BY 1
  `;
  const byKey = new Map(rows.map((r) => [r.key, r.total]));
  return keys.map((key) => ({ month: key, total: byKey.get(key) ?? 0 }));
}

export async function queryMonthOverMonth() {
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;
  const [row] = await prisma.$queryRaw<{ thisMonthTotal: number; lastMonthTotal: number }[]>`
    SELECT
      COALESCE(SUM(total) FILTER (WHERE to_char(date, 'YYYY-MM') = ${thisKey}), 0)::float8 AS "thisMonthTotal",
      COALESCE(SUM(total) FILTER (WHERE to_char(date, 'YYYY-MM') = ${lastKey}), 0)::float8 AS "lastMonthTotal"
    FROM "Invoice"
    WHERE "companyId" = ${await currentCompanyId()} AND date >= ${new Date(`${lastKey}-01T00:00:00Z`)}
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
export async function queryTopCustomers(filters?: ReportFilters, limit?: number) {
  return prisma.$queryRaw<{ name: string; shopName: string | null; state: string; total: number; balance: number; count: number }[]>`
    SELECT
      c.name AS "name",
      c."shopName" AS "shopName",
      c.state AS "state",
      SUM(i.total)::float8 AS "total",
      SUM(GREATEST(i.total - i."amountPaid", 0))::float8 AS "balance",
      COUNT(*)::int AS "count"
    FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
    ${whereSql(await filterConds(filters, { excludeDrafts: true }))}
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
export async function queryGstSummary(filters?: ReportFilters): Promise<GstSummary> {
  const range = { dateFrom: filters?.dateFrom, dateTo: filters?.dateTo, customerId: filters?.customerId };

  const purchaseConds: Prisma.Sql[] = [await tenantCond('p')];
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
      ${whereSql(await filterConds(range, { excludeDrafts: true }))}
    `,
    prisma.$queryRaw<TaxHeads[]>`
      SELECT ${heads('cn')} FROM "CreditNote" cn ${whereSql(await creditNoteConds(range))}
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
export async function queryProfitEstimate(filters?: ReportFilters, limit = 8): Promise<ProfitEstimate> {
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
// Sales analysis (Reports → Sales analysis tab)
// ---------------------------------------------------------------------------

export type SalesDimension = 'customer' | 'product' | 'category';

export type SalesRow = {
  key: string;
  /** The customer's or product's id, for links. Null for categories and
   * ad-hoc (non-catalogue) lines. */
  id: string | null;
  name: string;
  /** Second line: the customer's person/route, the product's category, or
   * how many products a category's sales came from. */
  sub: string;
  /** Taxable value after line and invoice discounts, less credit notes. */
  revenue: number;
  /** Same for the previous period — null when there's no bounded period to
   * compare against ("All time"). */
  prevRevenue: number | null;
  /** Main units sold (gross of returns, like Top products). */
  qty: number;
  qtyLabel: string;
  invoices: number;
  prevInvoices: number | null;
  /** Fraction of the period's total revenue. */
  share: number;
  /** (revenue − prevRevenue) ÷ prevRevenue. Null when there's no previous
   * period, or nothing was sold in it (see `isNew`). */
  growth: number | null;
  /** Sold this period but not at all in the previous one. */
  isNew: boolean;
  /** Cost of goods for the costed part of this period's sales — each
   * product's weighted-average purchase cost (the profit estimate's, see
   * report-data.ts averagePurchaseCosts) × main units sold, less units a
   * credit note put back into stock. Null when none of the row's lines has
   * a known cost. */
  cost: number | null;
  /** Costed sales − cost, and that ÷ costed sales. Null with `cost`. */
  profit: number | null;
  margin: number | null;
  /** Lines (a product, or an ad-hoc item) sold this period with no purchase
   * cost on file. They're left out of cost and profit — not counted as
   * free, which would overstate profit — and reported here instead. */
  costUnknownLines: number;
  /** Net sales of those lines. */
  costUnknownRevenue: number;
};

export type ProfitTotals = { cost: number | null; profit: number | null; margin: number | null; costUnknownLines: number; costUnknownRevenue: number };

export type SalesAnalysis = {
  by: SalesDimension;
  rows: SalesRow[];
  /** `costUnknownLines` here counts distinct products/items, not rows. */
  totals: { revenue: number; prevRevenue: number | null; invoices: number; prevInvoices: number | null } & ProfitTotals;
  /** The comparison period, or null for an open-ended range. */
  previous: { from: string; to: string } | null;
};

/** The equal-length period right before the filters' range — null when the
 * range is open on either side, where "previous" has no meaning. */
function previousRange(filters?: ReportFilters): { from: string; to: string } | null {
  if (!filters?.dateFrom || !filters?.dateTo) return null;
  if (filters.compareFrom && filters.compareTo) return { from: filters.compareFrom, to: filters.compareTo };
  return shiftToPreviousPeriod(filters.dateFrom, filters.dateTo);
}

const CUSTOM_ITEMS = '__custom';
const NO_CATEGORY = '__none';

/** The grouping key for a sales line under each dimension. `line` is the
 * item alias (`it` invoice item / `ci` credit-note item), `doc` its
 * document (`i` / `cn`), and `p` the line's product, LEFT JOINed. The
 * custom-line key matches salesByProduct's, so the two always agree. */
function salesKeySql(by: SalesDimension, line: 'it' | 'ci', doc: 'i' | 'cn'): Prisma.Sql {
  const l = Prisma.raw(line);
  if (by === 'customer') return Prisma.sql`${Prisma.raw(doc)}."customerId"`;
  if (by === 'product') return Prisma.sql`COALESCE(${l}."productId", 'custom:' || lower(${l}.name) || '|' || lower(${l}.unit))`;
  return Prisma.sql`CASE WHEN ${l}."productId" IS NULL THEN ${Prisma.raw(`'${CUSTOM_ITEMS}'`)} ELSE COALESCE(NULLIF(p.category, ''), ${Prisma.raw(`'${NO_CATEGORY}'`)}) END`;
}

/** "1,240", "12.5" — a quantity without trailing zeros, Indian grouping. */
function qtyText(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-IN');
}

/** "120 Box", or "120 Box + 6 Kg" when a customer's or category's lines
 * span different main units (the largest two, then "…"). */
function unitsText(units: Map<string, number>): string {
  const parts = [...units.entries()].filter(([, q]) => q > 1e-6).sort((a, b) => b[1] - a[1]);
  if (!parts.length) return '—';
  const shown = parts.slice(0, 2).map(([u, q]) => `${qtyText(q)} ${u}`);
  return parts.length > 2 ? `${shown.join(' + ')} + …` : shown.join(' + ');
}

/** Sales for the period grouped by customer, product or category, side by
 * side with the previous equal-length period — the Sales analysis tab.
 *
 * Revenue follows the same rules as salesByProduct (line value with the
 * invoice discount spread pro rata, less credit notes in the period), so the
 * three views — and Top products on the Overview — always add up to the same
 * total. Both periods come from one pass over the widened date range, each
 * row flagged `cur` by its date. Invoice counts are DISTINCT per group, with
 * a GROUPING SETS row per period for the overall count (a product view's
 * per-row counts overlap, so they can't simply be summed).
 *
 * Cost and profit (this period only) follow getProfitEstimate exactly, per
 * product within each row: average purchase cost × max(sold − restocked, 0)
 * main units, with uncosted lines kept out and counted. */
export async function querySalesAnalysis(filters: ReportFilters | undefined, by: SalesDimension): Promise<SalesAnalysis> {
  const prev = previousRange(filters);
  const span: ReportFilters = { ...filters, dateFrom: prev?.from ?? filters?.dateFrom };
  const curStart = prev ? istDayRangeUtc(filters!.dateFrom!).gte : null;
  const isCur = (doc: 'i' | 'cn') => (curStart ? Prisma.sql`(${Prisma.raw(doc)}.date >= ${curStart})` : Prisma.sql`TRUE`);
  const lineKey = salesKeySql(by, 'it', 'i');
  const conds = whereSql(await filterConds(span, { excludeDrafts: true }));

  type LineRow = { cur: boolean; key: string; productId: string | null; unit: string; name: string; stockQty: number; qtyNoSnapshot: number; revenue: number };
  const [lineRows, countRows, returnRows] = await Promise.all([
    prisma.$queryRaw<LineRow[]>`
      WITH l AS (
        SELECT
          ${lineKey} AS "key",
          ${isCur('i')} AS "cur",
          it."productId",
          it.name,
          it.unit,
          it.qty,
          it."stockQty",
          it.qty * it.rate * (1 - it.discount / 100) AS line,
          i.taxable AS "docTaxable",
          SUM(it.qty * it.rate * (1 - it.discount / 100)) OVER (PARTITION BY it."invoiceId") AS "docSub"
        FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId" LEFT JOIN "Product" p ON p.id = it."productId"
        ${conds}
      )
      SELECT
        "cur",
        "key",
        "productId",
        unit AS "unit",
        MAX(name) AS "name",
        COALESCE(SUM("stockQty"), 0)::float8 AS "stockQty",
        COALESCE(SUM(qty) FILTER (WHERE "stockQty" IS NULL), 0)::float8 AS "qtyNoSnapshot",
        COALESCE(SUM(CASE WHEN "docSub" > 0 THEN line * "docTaxable" / "docSub" ELSE 0 END), 0)::float8 AS "revenue"
      FROM l
      GROUP BY 1, 2, 3, 4
    `,
    prisma.$queryRaw<{ cur: boolean; key: string | null; invoices: number }[]>`
      SELECT "cur", "key", COUNT(DISTINCT "invoiceId")::int AS "invoices"
      FROM (
        SELECT ${isCur('i')} AS "cur", ${lineKey} AS "key", it."invoiceId"
        FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId" LEFT JOIN "Product" p ON p.id = it."productId"
        ${conds}
      ) x
      GROUP BY GROUPING SETS (("cur", "key"), ("cur"))
    `,
    prisma.$queryRaw<{ cur: boolean; key: string; productId: string | null; unit: string; name: string; restockedStockQty: number; restockedNoSnapshot: number; revenue: number }[]>`
      WITH l AS (
        SELECT
          ${salesKeySql(by, 'ci', 'cn')} AS "key",
          ${isCur('cn')} AS "cur",
          ci."productId",
          ci.name,
          ci.unit,
          ci.qty,
          ci."stockQty",
          cn.restock,
          ci.qty * ci.rate * (1 - ci.discount / 100) AS line,
          cn.taxable AS "docTaxable",
          SUM(ci.qty * ci.rate * (1 - ci.discount / 100)) OVER (PARTITION BY ci."creditNoteId") AS "docSub"
        FROM "CreditNoteItem" ci JOIN "CreditNote" cn ON cn.id = ci."creditNoteId" LEFT JOIN "Product" p ON p.id = ci."productId"
        ${whereSql(await creditNoteConds(span))}
      )
      SELECT
        "cur",
        "key",
        "productId",
        unit AS "unit",
        MAX(name) AS "name",
        COALESCE(SUM("stockQty") FILTER (WHERE restock), 0)::float8 AS "restockedStockQty",
        COALESCE(SUM(qty) FILTER (WHERE restock AND "stockQty" IS NULL), 0)::float8 AS "restockedNoSnapshot",
        COALESCE(SUM(CASE WHEN "docSub" > 0 THEN line * "docTaxable" / "docSub" ELSE 0 END), 0)::float8 AS "revenue"
      FROM l
      GROUP BY 1, 2, 3, 4
    `,
  ]);

  const productIds = [...new Set([...lineRows, ...returnRows].map((r) => r.productId).filter((id): id is string => !!id))];
  const customerIds = by === 'customer' ? [...new Set([...lineRows, ...returnRows].map((r) => r.key))] : [];
  const [products, customers] = await Promise.all([
    loadProductMeta(productIds),
    customerIds.length
      ? prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, shopName: true, route: true, district: true, state: true } })
      : Promise.resolve([]),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const costs = await averagePurchaseCosts(products);
  const toMain = (productId: string | null, unit: string, stockQty: number, noSnapshot: number) => {
    const p = productId ? products.get(productId) : undefined;
    return round6(stockQty + (p ? noSnapshot * unitFactor(p, unit) : noSnapshot));
  };

  type Side = { revenue: number; qty: number; units: Map<string, number>; invoices: number };
  /** This period's sales of one product (or ad-hoc item) within a row — what
   * cost and profit are worked out from. */
  type Line = { productId: string | null; sold: number; restocked: number; revenue: number };
  type Acc = { key: string; productId: string | null; name: string; unit: string; cur: Side; prev: Side; productIds: Set<string>; lines: Map<string, Line> };
  const side = (): Side => ({ revenue: 0, qty: 0, units: new Map(), invoices: 0 });
  const groups = new Map<string, Acc>();
  const group = (r: { key: string; productId: string | null; name: string; unit: string }) => {
    let g = groups.get(r.key);
    if (!g) {
      g = { key: r.key, productId: r.productId, name: r.name, unit: r.unit, cur: side(), prev: side(), productIds: new Set(), lines: new Map() };
      groups.set(r.key, g);
    }
    return g;
  };
  const lineKeyOf = (r: { productId: string | null; name: string; unit: string }) => r.productId ?? `custom:${r.name.toLowerCase()}|${r.unit.toLowerCase()}`;
  const lineOf = (g: Acc, r: { productId: string | null; name: string; unit: string }) => {
    const k = lineKeyOf(r);
    let l = g.lines.get(k);
    if (!l) {
      l = { productId: r.productId, sold: 0, restocked: 0, revenue: 0 };
      g.lines.set(k, l);
    }
    return l;
  };

  for (const r of lineRows) {
    const p = r.productId ? products.get(r.productId) : undefined;
    const g = group(r);
    const s = r.cur ? g.cur : g.prev;
    const qty = round6(r.stockQty + (p ? r.qtyNoSnapshot * unitFactor(p, r.unit) : r.qtyNoSnapshot));
    s.revenue += r.revenue;
    s.qty = round6(s.qty + qty);
    const unit = unitLabel(p ? p.unit : r.unit);
    s.units.set(unit, round6((s.units.get(unit) ?? 0) + qty));
    if (r.productId) g.productIds.add(r.productId);
    if (r.cur) {
      const l = lineOf(g, r);
      l.sold = round6(l.sold + qty);
      l.revenue += r.revenue;
    }
  }
  for (const r of returnRows) {
    const g = group(r);
    (r.cur ? g.cur : g.prev).revenue -= r.revenue;
    if (r.cur) {
      const l = lineOf(g, r);
      l.restocked = round6(l.restocked + toMain(r.productId, r.unit, r.restockedStockQty, r.restockedNoSnapshot));
      l.revenue -= r.revenue;
    }
  }

  // Cost and profit per row, line by line — the profit estimate's rules.
  const unknownLines = new Set<string>();
  let totalCost = 0;
  let totalKnown = 0;
  let totalUnknownRevenue = 0;
  let anyCosted = false;
  const profitOf = (g: Acc) => {
    let cost = 0;
    let known = 0;
    let costed = false;
    let unknownCount = 0;
    let unknownRevenue = 0;
    for (const [k, l] of g.lines) {
      const unitCost = l.productId ? costs.get(l.productId) : undefined;
      if (unitCost === undefined) {
        if (l.revenue > 0.004 || l.sold > 1e-6) {
          unknownCount++;
          unknownRevenue += Math.max(l.revenue, 0);
          unknownLines.add(k);
        }
        continue;
      }
      costed = true;
      known += l.revenue;
      cost += unitCost * Math.max(l.sold - l.restocked, 0);
    }
    totalCost += cost;
    totalKnown += known;
    totalUnknownRevenue += unknownRevenue;
    anyCosted ||= costed;
    const profit = known - cost;
    return {
      cost: costed ? cost : null,
      profit: costed ? profit : null,
      margin: costed && Math.abs(known) > 0.004 ? profit / known : null,
      costUnknownLines: unknownCount,
      costUnknownRevenue: unknownRevenue,
    };
  };
  const totalInvoices = { cur: 0, prev: 0 };
  for (const r of countRows) {
    if (r.key === null) totalInvoices[r.cur ? 'cur' : 'prev'] = r.invoices;
    else {
      const g = groups.get(r.key);
      if (g) (r.cur ? g.cur : g.prev).invoices = r.invoices;
    }
  }

  const totalRevenue = [...groups.values()].reduce((s, g) => s + g.cur.revenue, 0);
  const prevRevenue = [...groups.values()].reduce((s, g) => s + g.prev.revenue, 0);
  const moved = (s: Side) => Math.abs(s.revenue) > 0.004 || s.qty > 1e-6;

  const rows: SalesRow[] = [...groups.values()]
    .filter((g) => moved(g.cur) || moved(g.prev))
    .map((g) => {
      let id: string | null = null;
      let name = g.name;
      let sub = '';
      let qtyLabel = unitsText(g.cur.units);
      if (by === 'customer') {
        const c = customerById.get(g.key);
        id = g.key;
        name = c ? customerDisplayName(c) : 'Unknown customer';
        sub = c ? [c.shopName ? c.name : null, c.route || c.district || c.state].filter(Boolean).join(' · ') : '';
      } else if (by === 'product') {
        const p = g.productId ? products.get(g.productId) : undefined;
        id = g.productId;
        name = p?.name ?? g.name;
        sub = p ? p.category || 'Uncategorised' : 'Custom item';
        if (p && g.cur.qty > 1e-6) qtyLabel = formatStock(g.cur.qty, p);
      } else {
        name = g.key === CUSTOM_ITEMS ? 'Custom items' : g.key === NO_CATEGORY ? 'Uncategorised' : g.key;
        sub = g.key === CUSTOM_ITEMS ? 'Lines not from the catalogue' : `${g.productIds.size} product${g.productIds.size === 1 ? '' : 's'}`;
      }
      const hasPrev = !!prev;
      return {
        key: g.key,
        id,
        name,
        sub,
        revenue: g.cur.revenue,
        prevRevenue: hasPrev ? g.prev.revenue : null,
        qty: g.cur.qty,
        qtyLabel,
        invoices: g.cur.invoices,
        prevInvoices: hasPrev ? g.prev.invoices : null,
        share: totalRevenue > 0.004 ? g.cur.revenue / totalRevenue : 0,
        growth: hasPrev && g.prev.revenue > 0.004 ? (g.cur.revenue - g.prev.revenue) / g.prev.revenue : null,
        isNew: hasPrev && !moved(g.prev) && moved(g.cur),
        ...profitOf(g),
      };
    })
    .sort((a, b) => b.revenue - a.revenue || (b.prevRevenue ?? 0) - (a.prevRevenue ?? 0));

  return {
    by,
    rows,
    totals: {
      revenue: totalRevenue,
      prevRevenue: prev ? prevRevenue : null,
      invoices: totalInvoices.cur,
      prevInvoices: prev ? totalInvoices.prev : null,
      cost: anyCosted ? totalCost : null,
      profit: anyCosted ? totalKnown - totalCost : null,
      margin: anyCosted && Math.abs(totalKnown) > 0.004 ? (totalKnown - totalCost) / totalKnown : null,
      costUnknownLines: unknownLines.size,
      costUnknownRevenue: totalUnknownRevenue,
    },
    previous: prev,
  };
}

export type WeekdayPoint = {
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  dow: number;
  label: string;
  /** Taxable value billed on this weekday across the period. */
  revenue: number;
  invoices: number;
  /** How many of this weekday fall in the period (up to today). */
  days: number;
  /** revenue ÷ days — a typical Monday, so a month with five Mondays and
   * four Sundays doesn't make Monday look busier than it is. */
  average: number;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Billing by day of the week for the filtered invoices — which days the
 * trucks sell most. The period runs from the filter's start (or the first
 * matching invoice, for "All time") to its end or today, whichever is
 * earlier, so future days in "This month" don't dilute the averages. */
export async function querySalesByWeekday(filters?: ReportFilters): Promise<WeekdayPoint[]> {
  const conds = whereSql(await filterConds(filters, { excludeDrafts: true }));
  const [rows, [span]] = await Promise.all([
    prisma.$queryRaw<{ dow: number; revenue: number; invoices: number }[]>`
      SELECT EXTRACT(ISODOW FROM i.date)::int AS "dow", COALESCE(SUM(i.taxable), 0)::float8 AS "revenue", COUNT(*)::int AS "invoices"
      FROM "Invoice" i
      ${conds}
      GROUP BY 1
    `,
    prisma.$queryRaw<{ first: Date | null }[]>`SELECT MIN(i.date) AS "first" FROM "Invoice" i ${conds}`,
  ]);

  const today = todayIst();
  const from = filters?.dateFrom ?? span.first?.toISOString().slice(0, 10) ?? null;
  const to = filters?.dateTo && filters.dateTo < today ? filters.dateTo : today;
  const days = new Array(7).fill(0);
  if (from && from <= to) {
    const start = new Date(`${from}T12:00:00Z`).getTime();
    const end = new Date(`${to}T12:00:00Z`).getTime();
    for (let t = start; t <= end; t += DAY_MS) days[(new Date(t).getUTCDay() + 6) % 7]++;
  }

  const byDow = new Map(rows.map((r) => [r.dow, r]));
  return WEEKDAYS.map((label, i) => {
    const r = byDow.get(i + 1);
    const revenue = r?.revenue ?? 0;
    return { dow: i + 1, label, revenue, invoices: r?.invoices ?? 0, days: days[i], average: days[i] > 0 ? revenue / days[i] : 0 };
  });
}

// ---------------------------------------------------------------------------
// Receivables (Reports → Receivables tab)
// ---------------------------------------------------------------------------

export type AgeingBucket = 'notDue' | 'd1to30' | 'd31to60' | 'd61to90' | 'd90plus';
export type AgeingAmounts = Record<AgeingBucket, number>;

export type ReceivableRow = {
  customerId: string;
  name: string;
  sub: string;
  phone: string | null;
  /** Unpaid balance across the customer's open invoices. */
  due: number;
  buckets: AgeingAmounts;
  invoices: number;
  /** The customer's oldest unpaid invoice (by invoice date). */
  oldest: { id: string; number: string; date: string; daysOverdue: number };
  /** Last money actually received from them (credit-note adjustments
   * aren't payments), on any invoice. */
  lastPayment: string | null;
};

export type Receivables = {
  /** Today (IST) — what "days past due" counts to. */
  asOf: string;
  totals: AgeingAmounts & { due: number; overdue: number; invoices: number };
  /** Billed and settled on the filtered (non-draft) invoices. */
  billed: number;
  settled: number;
  /** settled ÷ billed. Null when nothing was billed. */
  collectionRate: number | null;
  /** Days sales outstanding: what's still owed, in days of the period's
   * average billing. Null when nothing was billed. */
  dso: number | null;
  periodDays: number;
  rows: ReceivableRow[];
};

/** Who owes what and for how long, on issued invoices dated in the filtered
 * period (all of them for "All time"), aged by days past their due date as of
 * today: not yet due, 1–30, 31–60, 61–90, over 90. The status filter doesn't
 * apply — an unpaid invoice is SENT or PARTIALLY_PAID by definition.
 *
 * DSO = outstanding ÷ (billed ÷ days in the period), the period running from
 * its start (or the first invoice) to its end or today, whichever is
 * earlier. Collection rate = settled ÷ billed on the same invoices, where
 * "settled" counts credit notes adjusted against them too (amountPaid). */
export async function queryReceivables(filters?: ReportFilters): Promise<Receivables> {
  const today = todayIst();
  const conds = await filterConds({ ...filters, status: undefined }, { excludeDrafts: true });

  type Row = {
    customerId: string;
    name: string;
    shopName: string | null;
    phone: string | null;
    route: string | null;
    district: string | null;
    state: string;
    due: number;
    invoices: number;
    oldestId: string;
    oldestNumber: string;
    oldestDate: Date;
    oldestLate: number;
  } & AgeingAmounts;

  const [rows, [period]] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      WITH o AS (
        SELECT i.id, i.number, i.date, i."customerId", (i.total - i."amountPaid") AS bal, (${today}::date - i.due::date) AS late
        FROM "Invoice" i
        ${whereSql([...conds, Prisma.sql`i.total - i."amountPaid" > 0.004`])}
      )
      SELECT
        o."customerId" AS "customerId",
        c.name AS "name",
        c."shopName" AS "shopName",
        c.phone AS "phone",
        c.route AS "route",
        c.district AS "district",
        c.state AS "state",
        SUM(o.bal)::float8 AS "due",
        COALESCE(SUM(o.bal) FILTER (WHERE o.late <= 0), 0)::float8 AS "notDue",
        COALESCE(SUM(o.bal) FILTER (WHERE o.late BETWEEN 1 AND 30), 0)::float8 AS "d1to30",
        COALESCE(SUM(o.bal) FILTER (WHERE o.late BETWEEN 31 AND 60), 0)::float8 AS "d31to60",
        COALESCE(SUM(o.bal) FILTER (WHERE o.late BETWEEN 61 AND 90), 0)::float8 AS "d61to90",
        COALESCE(SUM(o.bal) FILTER (WHERE o.late > 90), 0)::float8 AS "d90plus",
        COUNT(*)::int AS "invoices",
        (array_agg(o.id ORDER BY o.date, o.number))[1] AS "oldestId",
        (array_agg(o.number ORDER BY o.date, o.number))[1] AS "oldestNumber",
        MIN(o.date) AS "oldestDate",
        ((array_agg(o.late ORDER BY o.date, o.number))[1])::int AS "oldestLate"
      FROM o JOIN "Customer" c ON c.id = o."customerId"
      GROUP BY o."customerId", c.id
      ORDER BY "due" DESC
    `,
    prisma.$queryRaw<{ billed: number; settled: number; first: Date | null }[]>`
      SELECT
        COALESCE(SUM(i.total), 0)::float8 AS "billed",
        COALESCE(SUM(LEAST(i."amountPaid", i.total)), 0)::float8 AS "settled",
        MIN(i.date) AS "first"
      FROM "Invoice" i
      ${whereSql(conds)}
    `,
  ]);

  const lastPayments = rows.length
    ? await prisma.$queryRaw<{ customerId: string; last: Date }[]>`
        SELECT i."customerId" AS "customerId", MAX(p.date) AS "last"
        FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
        WHERE i."companyId" = ${await currentCompanyId()} AND p."creditNoteId" IS NULL AND i."customerId" IN (${Prisma.join(rows.map((r) => r.customerId))})
        GROUP BY 1
      `
    : [];
  const lastPaid = new Map(lastPayments.map((r) => [r.customerId, r.last.toISOString().slice(0, 10)]));

  const totals: Receivables['totals'] = { notDue: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0, due: 0, overdue: 0, invoices: 0 };
  const out: ReceivableRow[] = rows.map((r) => {
    const buckets: AgeingAmounts = { notDue: r.notDue, d1to30: r.d1to30, d31to60: r.d31to60, d61to90: r.d61to90, d90plus: r.d90plus };
    for (const k of Object.keys(buckets) as AgeingBucket[]) totals[k] += buckets[k];
    totals.due += r.due;
    totals.invoices += r.invoices;
    return {
      customerId: r.customerId,
      name: customerDisplayName(r),
      sub: [r.shopName ? r.name : null, r.route || r.district || r.state].filter(Boolean).join(' · '),
      phone: r.phone,
      due: r.due,
      buckets,
      invoices: r.invoices,
      oldest: { id: r.oldestId, number: r.oldestNumber, date: r.oldestDate.toISOString().slice(0, 10), daysOverdue: Math.max(0, r.oldestLate) },
      lastPayment: lastPaid.get(r.customerId) ?? null,
    };
  });
  totals.overdue = totals.due - totals.notDue;

  const from = filters?.dateFrom ?? period.first?.toISOString().slice(0, 10) ?? today;
  const to = filters?.dateTo && filters.dateTo < today ? filters.dateTo : today;
  const periodDays = Math.max(1, Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / DAY_MS) + 1);

  return {
    asOf: today,
    totals,
    billed: period.billed,
    settled: period.settled,
    collectionRate: period.billed > 0.004 ? period.settled / period.billed : null,
    dso: period.billed > 0.004 ? totals.due / (period.billed / periodDays) : null,
    periodDays,
    rows: out,
  };
}

// ---------------------------------------------------------------------------
// Collections (Reports → Collections tab)
// ---------------------------------------------------------------------------

export type PaymentModeRow = { mode: string; amount: number; count: number; share: number };

export type LargePayment = {
  id: string;
  date: string;
  amount: number;
  mode: string;
  reference: string | null;
  receiptNo: string | null;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customer: string;
};

export type CollectionsReport = {
  /** Everything settled in the period, credit notes included. */
  total: number;
  count: number;
  /** The part of `total` that was credit notes adjusted, not money in. */
  creditNotes: number;
  /** Same total for the previous equal-length period (null: open range). */
  prevTotal: number | null;
  byMode: PaymentModeRow[];
  granularity: 'day' | 'month';
  trend: { key: string; label: string; amount: number }[];
  /** Invoices whose final payment landed in the period: average days from
   * invoice date to that payment, and how many were settled by their due
   * date. Null when none were. */
  avgDaysToPay: number | null;
  paidInvoices: number;
  onTimeShare: number | null;
  largest: LargePayment[];
};

/** How a payment row reads in the mode breakdown — a credit note adjusted
 * against an invoice is its own "mode", and a payment saved without one
 * isn't lumped in with any real mode. */
const PAYMENT_MODE_SQL = Prisma.raw(`CASE WHEN p."creditNoteId" IS NOT NULL THEN 'Credit note' ELSE COALESCE(NULLIF(btrim(p.mode), ''), 'Not recorded') END`);

/** Conditions on `"Payment" p JOIN "Invoice" i` — the payment's own date in
 * the given range (not the invoice's), the customer filter on its invoice. */
async function paymentConds(customerId: string | undefined, range: { from?: string; to?: string }): Promise<Prisma.Sql[]> {
  const conds: Prisma.Sql[] = [await tenantCond('i'), Prisma.sql`i.status <> 'DRAFT'`];
  if (customerId) conds.push(Prisma.sql`i."customerId" = ${customerId}`);
  if (range.from) conds.push(Prisma.sql`p.date >= ${istDayRangeUtc(range.from).gte}`);
  if (range.to) conds.push(Prisma.sql`p.date < ${istDayRangeUtc(range.to).lt}`);
  return conds;
}

/** Money received in the period — by payment date, whatever the invoice's
 * date — split by mode, over time (trendBuckets' days or months), the
 * largest receipts, and how long invoices settled in the period took to be
 * paid in full. The status filter doesn't apply here. */
export async function queryCollections(filters?: ReportFilters): Promise<CollectionsReport> {
  const customerId = filters?.customerId;
  const range = { from: filters?.dateFrom, to: filters?.dateTo };
  const conds = whereSql(await paymentConds(customerId, range));
  const prev = previousRange(filters);
  const { granularity, buckets, rangeStart, rangeEnd } = trendBuckets(filters);
  const fmt = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';

  // "Paid in full" = the invoice is PAID now, and its last payment is the
  // one that did it.
  const paidConds: Prisma.Sql[] = [];
  if (range.from) paidConds.push(Prisma.sql`"paidAt" >= ${istDayRangeUtc(range.from).gte}`);
  if (range.to) paidConds.push(Prisma.sql`"paidAt" < ${istDayRangeUtc(range.to).lt}`);

  const [byMode, trendRows, prevRows, [settle], largest] = await Promise.all([
    prisma.$queryRaw<{ mode: string; amount: number; count: number }[]>`
      SELECT ${PAYMENT_MODE_SQL} AS "mode", SUM(p.amount)::float8 AS "amount", COUNT(*)::int AS "count"
      FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
      ${conds}
      GROUP BY 1
      ORDER BY 2 DESC
    `,
    prisma.$queryRaw<{ key: string; amount: number }[]>`
      SELECT to_char(p.date, ${fmt}) AS "key", SUM(p.amount)::float8 AS "amount"
      FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
      ${whereSql([...(await paymentConds(customerId, {})), Prisma.sql`p.date >= ${rangeStart}`, Prisma.sql`p.date < ${rangeEnd}`])}
      GROUP BY 1
    `,
    prev
      ? prisma.$queryRaw<{ amount: number }[]>`
          SELECT COALESCE(SUM(p.amount), 0)::float8 AS "amount"
          FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
          ${whereSql(await paymentConds(customerId, prev))}
        `
      : Promise.resolve(null),
    prisma.$queryRaw<{ avgDays: number | null; n: number; onTime: number }[]>`
      WITH f AS (
        SELECT i.date, i.due, MAX(p.date) AS "paidAt"
        FROM "Invoice" i JOIN "Payment" p ON p."invoiceId" = i.id
        WHERE i."companyId" = ${await currentCompanyId()} AND i.status = 'PAID' ${customerId ? Prisma.sql`AND i."customerId" = ${customerId}` : Prisma.empty}
        GROUP BY i.id
      )
      SELECT
        AVG(GREATEST("paidAt"::date - date::date, 0))::float8 AS "avgDays",
        COUNT(*)::int AS "n",
        (COUNT(*) FILTER (WHERE "paidAt"::date <= due::date))::int AS "onTime"
      FROM f
      ${whereSql(paidConds)}
    `,
    prisma.$queryRaw<(Omit<LargePayment, 'date' | 'customer'> & { date: Date; name: string; shopName: string | null })[]>`
      SELECT
        p.id AS "id",
        p.date AS "date",
        p.amount::float8 AS "amount",
        ${PAYMENT_MODE_SQL} AS "mode",
        p.reference AS "reference",
        p."receiptNo" AS "receiptNo",
        i.id AS "invoiceId",
        i.number AS "invoiceNumber",
        c.id AS "customerId",
        c.name AS "name",
        c."shopName" AS "shopName"
      FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId" JOIN "Customer" c ON c.id = i."customerId"
      ${conds}
      ORDER BY p.amount DESC, p.date DESC
      LIMIT 10
    `,
  ]);

  const total = byMode.reduce((s, r) => s + r.amount, 0);
  const trend = new Map(trendRows.map((r) => [r.key, r.amount]));
  return {
    total,
    count: byMode.reduce((s, r) => s + r.count, 0),
    creditNotes: byMode.find((r) => r.mode === 'Credit note')?.amount ?? 0,
    prevTotal: prevRows ? prevRows[0].amount : null,
    byMode: byMode.map((r) => ({ ...r, share: total > 0.004 ? r.amount / total : 0 })),
    granularity,
    trend: buckets.map((b) => ({ key: b.key, label: b.label, amount: trend.get(b.key) ?? 0 })),
    avgDaysToPay: settle.n > 0 ? settle.avgDays : null,
    paidInvoices: settle.n,
    onTimeShare: settle.n > 0 ? settle.onTime / settle.n : null,
    largest: largest.map(({ name, shopName, date, ...r }) => ({ ...r, date: date.toISOString().slice(0, 10), customer: customerDisplayName({ name, shopName }) })),
  };
}

// ---------------------------------------------------------------------------
// Inventory insights (Reports → Inventory tab)
// ---------------------------------------------------------------------------

export type FastMover = {
  id: string;
  name: string;
  category: string;
  /** Main units sold in the period. */
  qty: number;
  qtyLabel: string;
  revenue: number;
  /** Main units on hand now. */
  stock: number;
  stockLabel: string;
  daysLeft: number | null;
};

export type SlowStockItem = {
  id: string;
  name: string;
  category: string;
  stockLabel: string;
  /** Stock × average purchase cost (selling price where no cost is known). */
  value: number;
  lastSold: string | null;
  /** Days since the last sale; null when it has never sold. */
  daysSinceSale: number | null;
};

export type RunningLowItem = {
  id: string;
  name: string;
  status: StockStatus;
  stockLabel: string;
  alertLabel: string | null;
  /** "1 Box + 4 Pc a day" at the last 30 days' rate; null when it hasn't sold. */
  dailyLabel: string | null;
  daysLeft: number | null;
};

export type InventoryInsights = {
  tracked: number;
  inStock: number;
  low: number;
  out: number;
  stockValue: number;
  /** In-stock products valued at selling price for want of a purchase cost. */
  valuedAtPrice: number;
  byCategory: { category: string; value: number; products: number; share: number }[];
  fastMovers: FastMover[];
  /** Tracked, in stock, and not sold for 30+ days (or ever) — the tab
   * narrows it to 60/90 days itself. Most valuable first. */
  slowStock: SlowStockItem[];
  runningLow: RunningLowItem[];
  reorderLeadDays: number;
  salesWindowDays: number;
};

/** Same window as the Inventory screen's "days left" (src/actions/inventory.ts),
 * so the two never disagree about when something runs out. */
const SALES_WINDOW_DAYS = 30;
const EPS = 1e-6;

/** Stock-side view of the business for tracked products. What's on the
 * shelf (value by category, slow and dead stock, what's running low) is a
 * snapshot as of now and ignores the filters; fast movers are the period's
 * best sellers by main units, so they follow the date range and customer.
 *
 * Value uses the Reports profit estimate's average purchase cost
 * (report-data.ts), falling back to selling price like the dashboard's stock
 * card. Days left uses the Inventory screen's own formula — net units out of
 * the ledger over the last 30 days. */
export async function queryInventoryInsights(filters?: ReportFilters): Promise<InventoryInsights> {
  const rows = await prisma.product.findMany({
    where: { trackStock: true },
    select: { id: true, name: true, category: true, unit: true, price: true, packQty: true, stockQty: true, lowStockAt: true, priceTiers: { select: { unit: true, approxQty: true }, orderBy: { sortOrder: 'asc' } } },
  });
  const empty: InventoryInsights = {
    tracked: 0,
    inStock: 0,
    low: 0,
    out: 0,
    stockValue: 0,
    valuedAtPrice: 0,
    byCategory: [],
    fastMovers: [],
    slowStock: [],
    runningLow: [],
    reorderLeadDays: 7,
    salesWindowDays: SALES_WINDOW_DAYS,
  };
  if (!rows.length) return empty;

  const products = rows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    packQty: p.packQty ?? undefined,
    priceTiers: p.priceTiers.map((t) => ({ unit: t.unit, approxQty: t.approxQty == null ? undefined : Number(t.approxQty) })),
    price: Number(p.price),
    stockQty: Number(p.stockQty),
    lowStockAt: p.lowStockAt == null ? null : Number(p.lowStockAt),
    trackStock: true,
  }));
  const byId = new Map(products.map((p) => [p.id, p]));
  const ids = products.map((p) => p.id);
  const since = new Date(Date.now() - SALES_WINDOW_DAYS * DAY_MS);

  const [company, costs, sales, outflow, lastSoldRows] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: await currentCompanyId() }, select: { reorderLeadDays: true } }),
    averagePurchaseCosts(byId),
    salesByProduct(filters),
    prisma.$queryRaw<{ productId: string; qty: number }[]>`
      SELECT "productId", COALESCE(SUM(qty), 0)::float8 AS "qty"
      FROM "StockMovement"
      WHERE "companyId" = ${await currentCompanyId()} AND type IN ('SALE', 'SALE_RETURN') AND date >= ${since} AND "productId" IN (${Prisma.join(ids)})
      GROUP BY 1
    `,
    prisma.$queryRaw<{ productId: string; last: Date }[]>`
      SELECT it."productId" AS "productId", MAX(i.date) AS "last"
      FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId"
      WHERE i."companyId" = ${await currentCompanyId()} AND i.status <> 'DRAFT' AND it."productId" IN (${Prisma.join(ids)})
      GROUP BY 1
    `,
  ]);

  // SALE rows are negative and returns positive, so the negated sum is what
  // actually left the freezer.
  const daily = new Map(outflow.map((r) => [r.productId, Math.max(0, -r.qty) / SALES_WINDOW_DAYS]));
  const daysLeftOf = (p: (typeof products)[number]) => {
    const rate = daily.get(p.id) ?? 0;
    return rate > EPS ? Math.floor((Math.max(0, p.stockQty) / rate) * 10) / 10 : null;
  };
  const lastSold = new Map(lastSoldRows.map((r) => [r.productId, r.last.toISOString().slice(0, 10)]));
  const today = todayIst();
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();

  let stockValue = 0;
  let valuedAtPrice = 0;
  let inStock = 0;
  let low = 0;
  let out = 0;
  const categories = new Map<string, { value: number; products: number }>();
  const slowStock: SlowStockItem[] = [];
  const runningLow: (RunningLowItem & { order: number })[] = [];

  for (const p of products) {
    const status = stockStatus(p);
    if (status === 'low') low++;
    if (status === 'out') out++;
    const daysLeft = daysLeftOf(p);

    if (p.stockQty > EPS) {
      inStock++;
      const cost = costs.get(p.id);
      if (cost === undefined) valuedAtPrice++;
      const value = p.stockQty * (cost ?? p.price);
      stockValue += value;
      const cat = p.category || 'Uncategorised';
      const c = categories.get(cat) ?? { value: 0, products: 0 };
      c.value += value;
      c.products++;
      categories.set(cat, c);

      const last = lastSold.get(p.id) ?? null;
      const daysSinceSale = last ? Math.round((todayMs - new Date(`${last}T00:00:00Z`).getTime()) / DAY_MS) : null;
      if (daysSinceSale === null || daysSinceSale >= 30) {
        slowStock.push({ id: p.id, name: p.name, category: p.category || 'Uncategorised', stockLabel: formatStock(p.stockQty, p), value, lastSold: last, daysSinceSale });
      }
    }

    if (status === 'out' || status === 'low' || (daysLeft !== null && daysLeft <= company.reorderLeadDays)) {
      const rate = daily.get(p.id) ?? 0;
      runningLow.push({
        id: p.id,
        name: p.name,
        status,
        stockLabel: formatStock(p.stockQty, p),
        alertLabel: p.lowStockAt != null ? formatStock(p.lowStockAt, p) : null,
        dailyLabel: rate > EPS ? formatStock(rate, p) : null,
        daysLeft,
        order: status === 'out' ? -1 : (daysLeft ?? Number.MAX_SAFE_INTEGER),
      });
    }
  }

  const fastMovers: FastMover[] = sales.rows
    .filter((r) => r.productId && byId.has(r.productId) && r.mainQty > EPS)
    .sort((a, b) => b.mainQty - a.mainQty || b.revenue - a.revenue)
    .slice(0, 10)
    .map((r) => {
      const p = byId.get(r.productId!)!;
      return {
        id: p.id,
        name: p.name,
        category: p.category || 'Uncategorised',
        qty: r.mainQty,
        qtyLabel: formatStock(r.mainQty, p),
        revenue: r.revenue,
        stock: p.stockQty,
        stockLabel: formatStock(p.stockQty, p),
        daysLeft: daysLeftOf(p),
      };
    });

  return {
    tracked: products.length,
    inStock,
    low,
    out,
    stockValue,
    valuedAtPrice,
    byCategory: [...categories.entries()]
      .map(([category, c]) => ({ category, value: c.value, products: c.products, share: stockValue > 0 ? c.value / stockValue : 0 }))
      .sort((a, b) => b.value - a.value),
    fastMovers,
    slowStock: slowStock.sort((a, b) => b.value - a.value),
    runningLow: runningLow.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map(({ order: _order, ...r }) => r),
    reorderLeadDays: company.reorderLeadDays,
    salesWindowDays: SALES_WINDOW_DAYS,
  };
}
