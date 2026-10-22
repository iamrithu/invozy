'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { istDayRangeUtc } from '@/lib/dates';
import { STATUS_ORDER, STATUS_LABEL } from '@/lib/report-status';

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

export type TopProduct = { key: string; name: string; qty: number; revenue: number };

/** Best-selling line items (by pre-tax line revenue) across the filtered
 * invoice set. Custom/ad-hoc line items (no productId) are grouped by name
 * instead, same as everywhere else a line item stands in for its catalog
 * product. */
export async function getTopProducts(filters?: ReportFilters, limit = 8): Promise<TopProduct[]> {
  await requireUser();
  return prisma.$queryRaw<TopProduct[]>`
    SELECT
      COALESCE(it."productId", 'custom:' || it.name) AS "key",
      MAX(it.name) AS "name",
      SUM(it.qty)::float8 AS "qty",
      SUM(it.qty * it.rate * (1 - it.discount / 100))::float8 AS "revenue"
    FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId"
    ${whereSql(filterConds(filters, { excludeDrafts: true }))}
    GROUP BY 1
    ORDER BY "revenue" DESC
    LIMIT ${limit}
  `;
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
