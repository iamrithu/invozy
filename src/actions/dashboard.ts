'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { istDayRangeUtc, todayIst } from '@/lib/dates';
import { customerDisplayName } from '@/lib/customer';
import { addDays, daysBetween, isIsoDate } from '@/lib/dashboard-period';
import { queryProfitEstimate } from '@/app/(app)/reports/report-queries';

// The dashboard's numbers. Unlike the old getDashboardStats (which summed
// every invoice, drafts included), everything here counts only *issued*
// invoices — sent, part-paid or paid — so "Sales" is what was actually
// billed, and receivables are what customers really owe. Periods are IST
// calendar dates (see src/lib/dates.ts); the dashboard's date filter
// resolves them in src/lib/dashboard-period.ts.

/** [gte, lt) UTC instants covering the IST dates from..to, both inclusive. */
function span(from: string, to: string) {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error('Pick a valid date range.');
  return { gte: istDayRangeUtc(from).gte, lt: istDayRangeUtc(to).lt };
}

export type PeriodFigures = {
  sales: number;
  credits: number;
  netSales: number;
  invoices: number;
  collected: number;
  /** Distinct customers (walk-in guests included) with an issued invoice in
   * the period, and how many of them were billed for the first time ever. */
  customers: number;
  newCustomers: number;
  /** What this period's invoices still owe today. */
  unpaid: number;
};

async function figures(r: { gte: Date; lt: Date }): Promise<PeriodFigures> {
  const [[inv], [cn], [pay], [fresh]] = await Promise.all([
    prisma.$queryRaw<{ total: number; n: number; customers: number; unpaid: number }[]>`
      SELECT
        COALESCE(SUM(total), 0)::float8 AS total,
        COUNT(*)::int AS n,
        COUNT(DISTINCT "customerId")::int AS customers,
        COALESCE(SUM(GREATEST(total - "amountPaid", 0)) FILTER (WHERE status IN ('SENT', 'PARTIALLY_PAID')), 0)::float8 AS unpaid
      FROM "Invoice" WHERE status <> 'DRAFT' AND date >= ${r.gte} AND date < ${r.lt}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(total), 0)::float8 AS total FROM "CreditNote" WHERE date >= ${r.gte} AND date < ${r.lt}`,
    // Cash actually received — a credit note settles an invoice without any
    // money changing hands, so its payment row isn't a collection.
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(amount), 0)::float8 AS total FROM "Payment" WHERE "creditNoteId" IS NULL AND date >= ${r.gte} AND date < ${r.lt}`,
    // A customer is new in the period when their first-ever issued invoice
    // falls inside it.
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT "customerId" FROM "Invoice" WHERE status <> 'DRAFT'
        GROUP BY "customerId" HAVING MIN(date) >= ${r.gte} AND MIN(date) < ${r.lt}
      ) t`,
  ]);
  return {
    sales: inv.total,
    credits: cn.total,
    netSales: inv.total - cn.total,
    invoices: inv.n,
    collected: pay.total,
    customers: inv.customers,
    newCustomers: fresh.n,
    unpaid: inv.unpaid,
  };
}

export type ProfitFigures = { profit: number; margin: number | null; unknownShare: number };

export type DashboardKpis = {
  current: PeriodFigures;
  previous: PeriodFigures;
  /** Gross profit estimate (Reports' method: weighted average purchase
   * cost), for the period and its comparison. */
  profit: ProfitFigures;
  previousProfit: ProfitFigures;
};

/** The chosen period's figures and its comparison period's — the ranges
 * come from resolveDashboardRange (inclusive IST dates). */
export async function getDashboardKpis(range: { from: string; to: string; prevFrom: string; prevTo: string }): Promise<DashboardKpis> {
  await requireUser();
  const [current, previous, p, pp] = await Promise.all([
    figures(span(range.from, range.to)),
    figures(span(range.prevFrom, range.prevTo)),
    queryProfitEstimate({ dateFrom: range.from, dateTo: range.to }, 0),
    queryProfitEstimate({ dateFrom: range.prevFrom, dateTo: range.prevTo }, 0),
  ]);
  const toProfit = (x: typeof p): ProfitFigures => ({ profit: x.profit, margin: x.margin, unknownShare: x.unknown.share });
  return { current, previous, profit: toProfit(p), previousProfit: toProfit(pp) };
}

export type DueSoon = { id: string; number: string; customer: string; phone: string | null; due: string; balance: number; daysLeft: number };

/** Issued invoices falling due in the next `days` days (today included) that
 * still owe money — chase these before they turn overdue. Soonest first. */
export async function getDueSoon(days = 7, limit = 6): Promise<{ items: DueSoon[]; count: number; total: number }> {
  await requireUser();
  const today = todayIst();
  const r = span(today, addDays(today, days));
  const where = { status: { in: ['SENT', 'PARTIALLY_PAID'] as ('SENT' | 'PARTIALLY_PAID')[] }, due: { gte: r.gte, lt: r.lt } };
  const rows = await prisma.invoice.findMany({
    where,
    orderBy: [{ due: 'asc' }, { number: 'asc' }],
    select: { id: true, number: true, due: true, total: true, amountPaid: true, customer: { select: { name: true, shopName: true, phone: true } } },
  });
  const open = rows.filter((x) => Number(x.total) - Number(x.amountPaid) > 0.004);
  return {
    count: open.length,
    total: open.reduce((s, x) => s + Number(x.total) - Number(x.amountPaid), 0),
    items: open.slice(0, limit).map((x) => {
      const due = new Date(x.due.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      return {
        id: x.id,
        number: x.number,
        customer: x.customer.shopName || x.customer.name,
        phone: x.customer.phone,
        due,
        balance: Number(x.total) - Number(x.amountPaid),
        daysLeft: daysBetween(today, due),
      };
    }),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type TrendPoint = { key: string; label: string; sales: number; collected: number };
export type Trend = { granularity: 'day' | 'month'; points: TrendPoint[] };

/** Issued sales and cash collected over the chosen period — one bar per day
 * when it spans a month or less (at least the last 7 days, so "Today" still
 * shows a week of context), else one per calendar month (at most the last
 * 24). Bars only count days inside the range, so they add up to the tiles. */
export async function getSalesCollectionsTrend(from: string, to: string): Promise<Trend> {
  await requireUser();
  const days = daysBetween(from, to) + 1;
  const daily = days <= 31;
  let start = from;
  const keys: { key: string; label: string }[] = [];

  if (daily) {
    if (days < 7) start = addDays(to, -6);
    for (let d = start; d <= to; d = addDays(d, 1)) keys.push({ key: d, label: `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}` });
  } else {
    let m = `${from.slice(0, 7)}-01`;
    const last = `${to.slice(0, 7)}-01`;
    while (m <= last) {
      keys.push({ key: m.slice(0, 7), label: `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}` });
      const d = new Date(`${m}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1);
      m = d.toISOString().slice(0, 10);
    }
    if (keys.length > 24) {
      keys.splice(0, keys.length - 24);
      start = `${keys[0].key}-01`;
    }
  }

  const r = span(start, to);
  const fmt = daily ? 'YYYY-MM-DD' : 'YYYY-MM';
  // Bucket by IST calendar date (UTC + 5:30), not the server's timezone.
  const [sales, collected] = await Promise.all([
    prisma.$queryRaw<{ k: string; total: number }[]>`
      SELECT to_char(date + interval '330 minutes', ${fmt}) AS k, SUM(total)::float8 AS total
      FROM "Invoice" WHERE status <> 'DRAFT' AND date >= ${r.gte} AND date < ${r.lt}
      GROUP BY 1`,
    prisma.$queryRaw<{ k: string; total: number }[]>`
      SELECT to_char(date + interval '330 minutes', ${fmt}) AS k, SUM(amount)::float8 AS total
      FROM "Payment" WHERE "creditNoteId" IS NULL AND date >= ${r.gte} AND date < ${r.lt}
      GROUP BY 1`,
  ]);
  const s = new Map(sales.map((x) => [x.k, x.total]));
  const c = new Map(collected.map((x) => [x.k, x.total]));
  return { granularity: daily ? 'day' : 'month', points: keys.map(({ key, label }) => ({ key, label, sales: s.get(key) ?? 0, collected: c.get(key) ?? 0 })) };
}

export type RouteSales = { name: string; total: number; shops: number; share: number; noRoute: boolean };

/** Issued sales in the period by delivery route (Customer.route — the same
 * field that groups the loading sheet). Walk-in guests and customers with
 * no route share one row. The five biggest routes are listed; the rest fold
 * into "Other routes". */
export async function getSalesByRoute(from: string, to: string): Promise<{ rows: RouteSales[]; total: number; anyRoutes: boolean }> {
  await requireUser();
  const r = span(from, to);
  const rows = await prisma.$queryRaw<{ route: string | null; total: number; shops: number }[]>`
    SELECT
      CASE WHEN c.guest OR NULLIF(btrim(c.route), '') IS NULL THEN NULL ELSE btrim(c.route) END AS route,
      SUM(i.total)::float8 AS total,
      COUNT(DISTINCT i."customerId")::int AS shops
    FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
    WHERE i.status <> 'DRAFT' AND i.date >= ${r.gte} AND i.date < ${r.lt}
    GROUP BY 1`;
  const total = rows.reduce((s, x) => s + x.total, 0);
  const named = rows.filter((x) => x.route !== null).sort((a, b) => b.total - a.total);
  const none = rows.find((x) => x.route === null);
  const share = (n: number) => (total > 0 ? n / total : 0);
  const out: RouteSales[] = named.slice(0, 5).map((x) => ({ name: x.route!, total: x.total, shops: x.shops, share: share(x.total), noRoute: false }));
  const rest = named.slice(5);
  if (rest.length) {
    const t = rest.reduce((s, x) => s + x.total, 0);
    out.push({ name: `Other routes (${rest.length})`, total: t, shops: rest.reduce((s, x) => s + x.shops, 0), share: share(t), noRoute: false });
  }
  if (none) out.push({ name: 'Walk-in & no route', total: none.total, shops: none.shops, share: share(none.total), noRoute: true });
  return { rows: out, total, anyRoutes: named.length > 0 };
}

export type AgingBucket = { key: 'current' | 'd30' | 'd60' | 'd90' | 'd90plus'; label: string; amount: number; count: number; overdue: boolean };

/** What customers owe on issued invoices, by how late it is. */
export async function getReceivablesAging(): Promise<AgingBucket[]> {
  await requireUser();
  const todayStart = istDayRangeUtc(todayIst()).gte;
  const rows = await prisma.$queryRaw<{ bucket: string; amount: number; count: number }[]>`
    SELECT
      CASE
        WHEN due >= ${todayStart} THEN 'current'
        WHEN ${todayStart}::timestamp - due <= interval '30 days' THEN 'd30'
        WHEN ${todayStart}::timestamp - due <= interval '60 days' THEN 'd60'
        WHEN ${todayStart}::timestamp - due <= interval '90 days' THEN 'd90'
        ELSE 'd90plus'
      END AS bucket,
      SUM(total - "amountPaid")::float8 AS amount,
      COUNT(*)::int AS count
    FROM "Invoice"
    WHERE status IN ('SENT', 'PARTIALLY_PAID') AND total - "amountPaid" > 0.004
    GROUP BY 1`;
  const by = new Map(rows.map((r) => [r.bucket, r]));
  const defs: [AgingBucket['key'], string, boolean][] = [
    ['current', 'Not yet due', false],
    ['d30', '1–30 days late', true],
    ['d60', '31–60 days late', true],
    ['d90', '61–90 days late', true],
    ['d90plus', 'Over 90 days late', true],
  ];
  return defs.map(([key, label, overdue]) => ({ key, label, overdue, amount: by.get(key)?.amount ?? 0, count: by.get(key)?.count ?? 0 }));
}

export type RecentInvoice = { id: string; number: string; date: string; status: string; total: number; balance: number; isOverdue: boolean; customer: string };

export async function getRecentInvoices(limit = 6): Promise<RecentInvoice[]> {
  await requireUser();
  const todayStart = istDayRangeUtc(todayIst()).gte;
  const rows = await prisma.invoice.findMany({
    orderBy: [{ date: 'desc' }, { number: 'desc' }],
    take: limit,
    select: { id: true, number: true, date: true, due: true, status: true, total: true, amountPaid: true, customer: { select: { name: true, shopName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: r.date.toISOString().slice(0, 10),
    status: r.status,
    total: Number(r.total),
    balance: Math.max(0, Number(r.total) - Number(r.amountPaid)),
    isOverdue: (r.status === 'SENT' || r.status === 'PARTIALLY_PAID') && r.due < todayStart,
    customer: r.customer.shopName || r.customer.name,
  }));
}

export type OpenInvoice = { id: string; number: string; customer: string; phone: string | null; balance: number; due: string; overdue: boolean };

/** Every issued invoice that still owes money, oldest due first — the
 * dashboard's Record payment picker. */
export async function getOpenInvoices(limit = 300): Promise<OpenInvoice[]> {
  await requireUser();
  const todayStart = istDayRangeUtc(todayIst()).gte;
  const rows = await prisma.$queryRaw<{ id: string; number: string; name: string; shopName: string | null; phone: string | null; balance: number; due: Date }[]>`
    SELECT i.id, i.number, c.name, c."shopName", c.phone, (i.total - i."amountPaid")::float8 AS balance, i.due
    FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
    WHERE i.status IN ('SENT', 'PARTIALLY_PAID') AND i.total - i."amountPaid" > 0.004
    ORDER BY i.due ASC, i.number ASC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    customer: customerDisplayName({ name: r.name, shopName: r.shopName }),
    phone: r.phone,
    balance: r.balance,
    due: new Date(r.due.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10),
    overdue: r.due < todayStart,
  }));
}

type StatusKey = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID';
export type StatusFigures = {
  count: number;
  total: number;
  balance: number;
  /** Invoices that still owe more than a rounding error. */
  openCount: number;
  overdueCount: number;
  overdue: number;
};

export type BusinessOverview = {
  /** Active products (what the Products screen lists by default). */
  products: { active: number; inactive: number; categories: number };
  /** Named customers — walk-in guests aren't a customer base. `withDues`
   * counts anyone (guests too) who owes money on an issued invoice. */
  customers: { active: number; inactive: number; withDues: number };
  suppliers: { active: number; inactive: number };
  invoices: {
    total: number;
    issued: number;
    byStatus: Record<StatusKey, StatusFigures>;
    /** Drafts that have taken their lines out of stock. */
    draftsHoldingStock: number;
  };
  creditNotes: { total: number; count: number };
  /** Issued invoices only. billed ≈ received + creditAdjusted + unpaid —
   * a credit note settling an invoice isn't money received. */
  money: {
    billed: number;
    received: number;
    creditAdjusted: number;
    unpaid: number;
    overdue: number;
    overdueCount: number;
    openCount: number;
    /** Days the longest-overdue invoice is past its due date (0: none). */
    oldestOverdueDays: number;
  };
  /** The customer owing the most overdue money, if anyone does. */
  biggestOverdue: { customer: string; amount: number; days: number } | null;
  purchases: { total: number; count: number; suppliers: number };
  /** All-time gross profit estimate (Reports' method). */
  profit: ProfitFigures;
  /** Invoices paid in full: average days from invoice to final payment, and
   * the share paid by the due date (as Reports → Collections works it out). */
  collection: { avgDaysToPay: number | null; onTimeShare: number | null; paidInvoices: number };
};

/** The whole business, all time: what's in the catalogue, who you buy from
 * and sell to, every invoice by where it is in its life (draft → sent →
 * part-paid → paid), where the billed money stands right now, what was
 * bought, the margin, and how quickly customers pay. Doesn't depend on the
 * dashboard's date filter. */
export async function getBusinessOverview(): Promise<BusinessOverview> {
  await requireUser();
  const today = todayIst();
  const todayStart = istDayRangeUtc(today).gte;
  const [[prod], [cust], [sup], [dues], statusRows, [pay], [cn], [buy], [late], biggest, [settle], profit] = await Promise.all([
    prisma.$queryRaw<{ active: number; inactive: number; categories: number }[]>`
      SELECT
        (COUNT(*) FILTER (WHERE active))::int AS active,
        (COUNT(*) FILTER (WHERE NOT active))::int AS inactive,
        (COUNT(DISTINCT category) FILTER (WHERE active))::int AS categories
      FROM "Product"`,
    prisma.$queryRaw<{ active: number; inactive: number }[]>`
      SELECT (COUNT(*) FILTER (WHERE active))::int AS active, (COUNT(*) FILTER (WHERE NOT active))::int AS inactive
      FROM "Customer" WHERE NOT guest`,
    prisma.$queryRaw<{ active: number; inactive: number }[]>`
      SELECT (COUNT(*) FILTER (WHERE active))::int AS active, (COUNT(*) FILTER (WHERE NOT active))::int AS inactive
      FROM "Supplier"`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT "customerId")::int AS n FROM "Invoice"
      WHERE status IN ('SENT', 'PARTIALLY_PAID') AND total - "amountPaid" > 0.004`,
    // Overdue only means something for sent / part-paid invoices (drafts are
    // never overdue, paid ones owe nothing) — read from those below.
    prisma.$queryRaw<{ status: StatusKey; n: number; total: number; balance: number; open: number; overdueCount: number; overdue: number; held: number }[]>`
      SELECT
        status::text AS status,
        COUNT(*)::int AS n,
        COALESCE(SUM(total), 0)::float8 AS total,
        COALESCE(SUM(GREATEST(total - "amountPaid", 0)), 0)::float8 AS balance,
        (COUNT(*) FILTER (WHERE total - "amountPaid" > 0.004))::int AS open,
        (COUNT(*) FILTER (WHERE due < ${todayStart} AND total - "amountPaid" > 0.004))::int AS "overdueCount",
        COALESCE(SUM(GREATEST(total - "amountPaid", 0)) FILTER (WHERE due < ${todayStart}), 0)::float8 AS overdue,
        (COUNT(*) FILTER (WHERE "stockTaken"))::int AS held
      FROM "Invoice" GROUP BY status`,
    prisma.$queryRaw<{ cash: number; credit: number }[]>`
      SELECT
        COALESCE(SUM(p.amount) FILTER (WHERE p."creditNoteId" IS NULL), 0)::float8 AS cash,
        COALESCE(SUM(p.amount) FILTER (WHERE p."creditNoteId" IS NOT NULL), 0)::float8 AS credit
      FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
      WHERE i.status <> 'DRAFT'`,
    prisma.$queryRaw<{ total: number; n: number }[]>`
      SELECT COALESCE(SUM(total), 0)::float8 AS total, COUNT(*)::int AS n FROM "CreditNote"`,
    prisma.$queryRaw<{ total: number; n: number; suppliers: number }[]>`
      SELECT COALESCE(SUM(total), 0)::float8 AS total, COUNT(*)::int AS n, COUNT(DISTINCT "supplierId")::int AS suppliers FROM "Purchase"`,
    // Dates are stored at UTC midnight of their calendar date, so ::date is
    // that calendar date; today's IST date comes in as a string.
    prisma.$queryRaw<{ days: number | null }[]>`
      SELECT MAX(${today}::date - due::date)::int AS days FROM "Invoice"
      WHERE status IN ('SENT', 'PARTIALLY_PAID') AND total - "amountPaid" > 0.004 AND due < ${todayStart}`,
    prisma.$queryRaw<{ name: string; shopName: string | null; amount: number; days: number }[]>`
      SELECT c.name, c."shopName", SUM(i.total - i."amountPaid")::float8 AS amount, MAX(${today}::date - i.due::date)::int AS days
      FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId"
      WHERE i.status IN ('SENT', 'PARTIALLY_PAID') AND i.total - i."amountPaid" > 0.004 AND i.due < ${todayStart}
      GROUP BY c.id, c.name, c."shopName"
      ORDER BY amount DESC
      LIMIT 1`,
    prisma.$queryRaw<{ avgDays: number | null; n: number; onTime: number }[]>`
      WITH f AS (
        SELECT i.date, i.due, MAX(p.date) AS "paidAt"
        FROM "Invoice" i JOIN "Payment" p ON p."invoiceId" = i.id
        WHERE i.status = 'PAID'
        GROUP BY i.id
      )
      SELECT
        AVG(GREATEST("paidAt"::date - date::date, 0))::float8 AS "avgDays",
        COUNT(*)::int AS n,
        (COUNT(*) FILTER (WHERE "paidAt"::date <= due::date))::int AS "onTime"
      FROM f`,
    queryProfitEstimate(undefined, 0),
  ]);

  const empty = (): StatusFigures => ({ count: 0, total: 0, balance: 0, openCount: 0, overdueCount: 0, overdue: 0 });
  const byStatus: Record<StatusKey, StatusFigures> = { DRAFT: empty(), SENT: empty(), PARTIALLY_PAID: empty(), PAID: empty() };
  let draftsHoldingStock = 0;
  for (const r of statusRows) {
    const owing = r.status === 'SENT' || r.status === 'PARTIALLY_PAID';
    if (r.status === 'DRAFT') draftsHoldingStock = r.held;
    byStatus[r.status] = {
      count: r.n,
      total: r.total,
      balance: owing ? r.balance : 0,
      openCount: owing ? r.open : 0,
      overdueCount: owing ? r.overdueCount : 0,
      overdue: owing ? r.overdue : 0,
    };
  }
  const { DRAFT, SENT, PARTIALLY_PAID: PART, PAID } = byStatus;
  const issued = SENT.count + PART.count + PAID.count;
  const top = biggest[0];

  return {
    products: prod,
    customers: { ...cust, withDues: dues.n },
    suppliers: sup,
    invoices: { total: DRAFT.count + issued, issued, byStatus, draftsHoldingStock },
    creditNotes: { total: cn.total, count: cn.n },
    money: {
      billed: SENT.total + PART.total + PAID.total,
      received: pay.cash,
      creditAdjusted: pay.credit,
      unpaid: SENT.balance + PART.balance,
      overdue: SENT.overdue + PART.overdue,
      overdueCount: SENT.overdueCount + PART.overdueCount,
      openCount: SENT.openCount + PART.openCount,
      oldestOverdueDays: late.days ?? 0,
    },
    biggestOverdue: top ? { customer: customerDisplayName({ name: top.name, shopName: top.shopName }), amount: top.amount, days: top.days } : null,
    purchases: { total: buy.total, count: buy.n, suppliers: buy.suppliers },
    profit: { profit: profit.profit, margin: profit.margin, unknownShare: profit.unknown.share },
    collection: { avgDaysToPay: settle.n > 0 ? settle.avgDays : null, onTimeShare: settle.n > 0 ? settle.onTime / settle.n : null, paidInvoices: settle.n },
  };
}
