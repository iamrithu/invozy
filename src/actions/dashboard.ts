'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { istDayRangeUtc, todayIst } from '@/lib/dates';

// The dashboard's numbers. Unlike the old getDashboardStats (which summed
// every invoice, drafts included), everything here counts only *issued*
// invoices — sent, part-paid or paid — so "Sales" is what was actually
// billed, and receivables are what customers really owe. Periods are IST
// calendar dates (see src/lib/dates.ts).

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
function prevMonthStart(date: string): string {
  const d = new Date(`${monthStart(date)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}
/** [from, to) as UTC instants for IST dates `from`..`toExclusive`. */
function range(from: string, toExclusive: string) {
  return { gte: istDayRangeUtc(from).gte, lt: istDayRangeUtc(toExclusive).gte };
}

export type PeriodFigures = { sales: number; credits: number; netSales: number; invoices: number; collected: number };

async function figures(r: { gte: Date; lt: Date }): Promise<PeriodFigures> {
  const [[inv], [cn], [pay]] = await Promise.all([
    prisma.$queryRaw<{ total: number; n: number }[]>`
      SELECT COALESCE(SUM(total), 0)::float8 AS total, COUNT(*)::int AS n
      FROM "Invoice" WHERE status <> 'DRAFT' AND date >= ${r.gte} AND date < ${r.lt}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(total), 0)::float8 AS total FROM "CreditNote" WHERE date >= ${r.gte} AND date < ${r.lt}`,
    // Cash actually received — a credit note settles an invoice without any
    // money changing hands, so its payment row isn't a collection.
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(amount), 0)::float8 AS total FROM "Payment" WHERE "creditNoteId" IS NULL AND date >= ${r.gte} AND date < ${r.lt}`,
  ]);
  return { sales: inv.total, credits: cn.total, netSales: inv.total - cn.total, invoices: inv.n, collected: pay.total };
}

export type DashboardPeriod = 'today' | 'month' | 'fy';

export type DashboardKpis = {
  period: DashboardPeriod;
  today: string;
  /** First and last IST date of the current period (for report links and
   * the top-customers/products filters). */
  from: string;
  to: string;
  /** "1–16 Nov", "Today", "FY 2026-27 so far". */
  periodLabel: string;
  /** What it's compared against: "1–16 Oct", "Yesterday", "same days of FY 2025-26". */
  previousLabel: string;
  current: PeriodFigures;
  previous: PeriodFigures;
  receivables: { due: number; overdue: number; overdueCount: number; openCount: number };
  /** Days of the month gone and left (today counts as gone) — for the
   * sales-target pace. Month view only. */
  monthDays: { elapsed: number; total: number } | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function spanLabel(from: string, toInclusive: string) {
  const m = MONTHS[Number(from.slice(5, 7)) - 1];
  const a = Number(from.slice(8));
  const b = Number(toInclusive.slice(8));
  return a === b ? `${a} ${m}` : `${a}–${b} ${m}`;
}

/** Indian financial year start (1 April) for a date. */
function fyStart(date: string): string {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 4 ? `${y}-04-01` : `${y - 1}-04-01`;
}
function fyLabel(start: string) {
  const y = Number(start.slice(0, 4));
  return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

/** The current period against a fair comparison — today vs yesterday, this
 * month so far vs the same days of last month, this financial year so far
 * vs the same span of the last one — plus what customers owe right now
 * (receivables don't depend on the period). */
export async function getDashboardKpis(period: DashboardPeriod = 'month'): Promise<DashboardKpis> {
  await requireUser();
  const today = todayIst();
  const tomorrow = addDays(today, 1);
  let from: string, prevFrom: string, prevToExclusive: string, periodLabel: string, previousLabel: string;

  if (period === 'today') {
    from = today;
    prevFrom = addDays(today, -1);
    prevToExclusive = today;
    periodLabel = 'Today';
    previousLabel = 'yesterday';
  } else if (period === 'fy') {
    from = fyStart(today);
    prevFrom = fyStart(addDays(from, -1));
    // Same number of days into last year, never past its end.
    prevToExclusive = [addDays(prevFrom, daysBetween(from, tomorrow)), from].sort()[0];
    periodLabel = `${fyLabel(from)} so far`;
    previousLabel = `the same days of ${fyLabel(prevFrom)}`;
  } else {
    from = monthStart(today);
    prevFrom = prevMonthStart(today);
    prevToExclusive = [addDays(prevFrom, Number(today.slice(8))), from].sort()[0];
    periodLabel = spanLabel(from, today);
    previousLabel = spanLabel(prevFrom, addDays(prevToExclusive, -1));
  }
  const todayStart = istDayRangeUtc(today).gte;

  const [current, previous, [rec]] = await Promise.all([
    figures(range(from, tomorrow)),
    figures(range(prevFrom, prevToExclusive)),
    prisma.$queryRaw<{ due: number; overdue: number; overdueCount: number; openCount: number }[]>`
      SELECT
        COALESCE(SUM(GREATEST(total - "amountPaid", 0)), 0)::float8 AS due,
        COALESCE(SUM(GREATEST(total - "amountPaid", 0)) FILTER (WHERE due < ${todayStart}), 0)::float8 AS overdue,
        (COUNT(*) FILTER (WHERE due < ${todayStart}))::int AS "overdueCount",
        COUNT(*)::int AS "openCount"
      FROM "Invoice"
      WHERE status IN ('SENT', 'PARTIALLY_PAID') AND total - "amountPaid" > 0.004`,
  ]);

  const nextMonth = addDays(`${monthStart(today).slice(0, 8)}28`, 4).slice(0, 7) + '-01';
  return {
    period,
    today,
    from,
    to: today,
    periodLabel,
    previousLabel,
    current,
    previous,
    receivables: rec,
    monthDays: period === 'month' ? { elapsed: Number(today.slice(8)), total: daysBetween(monthStart(today), nextMonth) } : null,
  };
}

export type DueSoon = { id: string; number: string; customer: string; phone: string | null; due: string; balance: number; daysLeft: number };

/** Issued invoices falling due in the next `days` days (today included) that
 * still owe money — chase these before they turn overdue. Soonest first. */
export async function getDueSoon(days = 7, limit = 6): Promise<{ items: DueSoon[]; count: number; total: number }> {
  await requireUser();
  const today = todayIst();
  const r = range(today, addDays(today, days + 1));
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

export type MonthPoint = { key: string; label: string; sales: number; collected: number };

/** Issued sales and cash collected per month for the last `months` months
 * (this one included), oldest first — the dashboard's main chart. */
export async function getSalesCollectionsTrend(months = 6): Promise<MonthPoint[]> {
  await requireUser();
  const today = todayIst();
  const keys: string[] = [];
  let cursor = monthStart(today);
  for (let i = 0; i < months; i++) {
    keys.unshift(cursor.slice(0, 7));
    cursor = prevMonthStart(cursor);
  }
  const from = istDayRangeUtc(`${keys[0]}-01`).gte;
  // Bucket by IST calendar month (UTC + 5:30), not the server's timezone.
  const [sales, collected] = await Promise.all([
    prisma.$queryRaw<{ k: string; total: number }[]>`
      SELECT to_char(date + interval '330 minutes', 'YYYY-MM') AS k, SUM(total)::float8 AS total
      FROM "Invoice" WHERE status <> 'DRAFT' AND date >= ${from}
      GROUP BY 1`,
    prisma.$queryRaw<{ k: string; total: number }[]>`
      SELECT to_char(date + interval '330 minutes', 'YYYY-MM') AS k, SUM(amount)::float8 AS total
      FROM "Payment" WHERE "creditNoteId" IS NULL AND date >= ${from}
      GROUP BY 1`,
  ]);
  const s = new Map(sales.map((r) => [r.k, r.total]));
  const c = new Map(collected.map((r) => [r.k, r.total]));
  return keys.map((k) => ({ key: k, label: `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}`, sales: s.get(k) ?? 0, collected: c.get(k) ?? 0 }));
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

/** How many products/customers exist — only for the brand-new-account
 * check (show the getting-started steps instead of empty charts). */
export async function getAccountSize() {
  await requireUser();
  const [products, customers, invoices] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.customer.count({ where: { guest: false } }),
    prisma.invoice.count(),
  ]);
  return { products, customers, invoices };
}
