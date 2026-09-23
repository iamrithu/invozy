'use server';

import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { computeTotals } from '@/lib/gst';
import { istDayRangeUtc } from '@/lib/dates';
import { STATUS_ORDER, STATUS_LABEL } from '@/lib/report-status';

/** Shared filter shape for every Reports query below — a date range (IST
 * calendar dates, see src/lib/dates.ts), an optional single customer, and
 * an optional status narrower than the blanket "exclude drafts" rule every
 * report already applies (see allInvoicesWithTotals's callers). All
 * optional so every existing no-args caller (getDashboardStats, etc.) keeps
 * working unchanged. */
export type ReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  status?: 'all' | 'SENT' | 'PARTIALLY_PAID' | 'PAID';
};

async function allInvoicesWithTotals(filters?: ReportFilters) {
  const company = await getCompany();
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId: company.id,
      ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      ...(filters?.status && filters.status !== 'all' ? { status: filters.status } : {}),
      ...(filters?.dateFrom || filters?.dateTo
        ? { date: { ...(filters.dateFrom ? istDayRangeUtc(filters.dateFrom) : {}), ...(filters.dateTo ? { lt: istDayRangeUtc(filters.dateTo).lt } : {}) } }
        : {}),
    },
    include: { customer: true, items: true, payments: true },
  });
  return invoices.map((inv) => {
    const totals = computeTotals(
      inv.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) })),
      { type: inv.overallDiscountType, value: Number(inv.overallDiscountValue) },
      {
        cgstRate: Number(inv.cgstRate),
        sgstRate: Number(inv.sgstRate),
        igstRate: Number(inv.igstRate),
        cgstEnabled: inv.cgstEnabled,
        sgstEnabled: inv.sgstEnabled,
        igstEnabled: inv.igstEnabled,
      },
      company.state,
      inv.customer.state
    );
    const amountPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    return { invoice: inv, totals, amountPaid, balanceDue: totals.total - amountPaid };
  });
}

export async function getDashboardStats() {
  const company = await getCompany();
  const all = await allInvoicesWithTotals();
  const totalInvoiced = all.reduce((s, r) => s + r.totals.total, 0);
  const outstanding = all.reduce((s, r) => s + Math.max(r.balanceDue, 0), 0);
  const collected = all.reduce((s, r) => s + r.amountPaid, 0);
  const [activeProducts, customerCount] = await Promise.all([
    prisma.product.count({ where: { companyId: company.id, active: true } }),
    prisma.customer.count({ where: { companyId: company.id, guest: false } }),
  ]);
  const overdue = all.filter((r) => r.invoice.status !== 'PAID' && r.invoice.due < new Date());
  const overdueTotal = overdue.reduce((s, r) => s + Math.max(r.balanceDue, 0), 0);

  const recent = all
    .sort((a, b) => b.invoice.date.getTime() - a.invoice.date.getTime())
    .slice(0, 8);

  return {
    totalInvoiced,
    outstanding,
    collected,
    activeProducts,
    customerCount,
    overdueCount: overdue.length,
    overdueTotal,
    recent,
  };
}

export async function getReportStats(filters?: ReportFilters) {
  const all = (await allInvoicesWithTotals(filters)).filter((r) => r.invoice.status !== 'DRAFT');
  return all.reduce(
    (acc, r) => ({
      taxable: acc.taxable + r.totals.taxable,
      cgst: acc.cgst + r.totals.cgst,
      sgst: acc.sgst + r.totals.sgst,
      igst: acc.igst + r.totals.igst,
      total: acc.total + r.totals.total,
      outstanding: acc.outstanding + Math.max(r.balanceDue, 0),
      invoiceCount: acc.invoiceCount + 1,
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, outstanding: 0, invoiceCount: 0 }
  );
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

type InvoiceWithTotals = Awaited<ReturnType<typeof allInvoicesWithTotals>>[number];

/** Sums billed (invoice totals) and collected (payment amounts) for each
 * bucket — a single pass shared by both the day- and month-bucketed paths
 * below so that logic isn't duplicated per granularity. `matches` decides
 * bucket membership by whichever key format that granularity uses (a plain
 * string compare against a pre-sliced ISO date, cheaper than re-parsing
 * every invoice/payment date per bucket). */
function bucketTrendPoints(all: InvoiceWithTotals[], buckets: { key: string; label: string }[], dateKeyOf: (d: Date) => string): TrendPoint[] {
  return buckets.map((b) => {
    const billed = all.filter((r) => dateKeyOf(r.invoice.date) === b.key).reduce((s, r) => s + r.totals.total, 0);
    const collected = all.reduce((s, r) => s + r.invoice.payments.filter((p) => dateKeyOf(p.date) === b.key).reduce((s2, p) => s2 + Number(p.amount), 0), 0);
    return { key: b.key, label: b.label, billed, collected };
  });
}

/** Billing (and collection) trend, bucketed by day when the filtered range
 * spans a month or less (so a "This week"/"This month" filter shows real
 * daily movement instead of one flat monthly bar) and by calendar month
 * otherwise — defaulting to the last 6 months for "All time" (unbounded) or
 * no filter, matching this report's original fixed window. Labels are
 * pre-formatted server-side (rather than a raw `YYYY-MM`/`YYYY-MM-DD` key)
 * so the chart component itself needs no date-parsing logic. `collected`
 * only counts payments on invoices that themselves pass the current
 * filters (customer/status), not every payment in the date range, so a
 * customer- or status-filtered view stays internally consistent. */
export async function getBillingTrend(filters?: ReportFilters): Promise<TrendPoint[]> {
  const all = (await allInvoicesWithTotals(filters)).filter((r) => r.invoice.status !== 'DRAFT');

  if (filters?.dateFrom && filters?.dateTo) {
    const fromD = new Date(`${filters.dateFrom}T12:00:00Z`);
    const toD = new Date(`${filters.dateTo}T12:00:00Z`);
    const spanDays = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86_400_000) + 1);

    if (spanDays <= 31) {
      const days = Array.from({ length: spanDays }, (_, i) => new Date(fromD.getTime() + i * 86_400_000));
      const buckets = days.map((d) => ({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) }));
      return bucketTrendPoints(all, buckets, (d) => d.toISOString().slice(0, 10));
    }
  }

  // Month-bucketed fallback — the filtered range's own months when bounded
  // (so e.g. "This year" shows Jan..current month), else the last 6
  // calendar months ending this month, matching the report's original
  // default window.
  const now = new Date();
  let monthStarts: Date[];
  if (filters?.dateFrom && filters?.dateTo) {
    const fromD = new Date(`${filters.dateFrom}T12:00:00Z`);
    const toD = new Date(`${filters.dateTo}T12:00:00Z`);
    monthStarts = [];
    const cursor = new Date(Date.UTC(fromD.getUTCFullYear(), fromD.getUTCMonth(), 1));
    const last = new Date(Date.UTC(toD.getUTCFullYear(), toD.getUTCMonth(), 1));
    while (cursor.getTime() <= last.getTime()) {
      monthStarts.push(new Date(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    monthStarts = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(now.getFullYear(), now.getMonth() - (5 - i), 1)));
  }

  const buckets = monthStarts.map((d) => ({
    key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
  }));
  return bucketTrendPoints(all, buckets, (d) => d.toISOString().slice(0, 7));
}

export type StatusBreakdownPoint = { status: string; label: string; count: number; total: number };

/** How the current filtered set of invoices splits by status — unlike
 * every other report query here, this deliberately does NOT drop drafts:
 * the point of this one is to show the full pipeline (including what's
 * still in progress), not just realized billing. */
export async function getStatusBreakdown(filters?: ReportFilters): Promise<StatusBreakdownPoint[]> {
  const all = await allInvoicesWithTotals(filters);
  const now = new Date();
  const byStatus = new Map<string, { count: number; total: number }>();
  for (const r of all) {
    const key = r.invoice.status !== 'PAID' && r.invoice.due < now ? 'OVERDUE' : r.invoice.status;
    const entry = byStatus.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += r.totals.total;
    byStatus.set(key, entry);
  }
  return STATUS_ORDER.filter((k) => byStatus.has(k)).map((k) => ({ status: k, label: STATUS_LABEL[k], ...byStatus.get(k)! }));
}

export type TopProduct = { key: string; name: string; qty: number; revenue: number };

/** Best-selling line items (by revenue) across the filtered invoice set —
 * computed from the same already-fetched invoice+item data
 * allInvoicesWithTotals loads (no second DB round trip). Custom/ad-hoc line
 * items (no productId) are grouped by name instead, same as everywhere else
 * a line item stands in for its catalog product. */
export async function getTopProducts(filters?: ReportFilters, limit = 8): Promise<TopProduct[]> {
  const all = (await allInvoicesWithTotals(filters)).filter((r) => r.invoice.status !== 'DRAFT');
  const byProduct = new Map<string, TopProduct>();
  for (const r of all) {
    for (const it of r.invoice.items) {
      const key = it.productId ?? `custom:${it.name}`;
      const revenue = Number(it.qty) * Number(it.rate) * (1 - Number(it.discount) / 100);
      const entry = byProduct.get(key) ?? { key, name: it.name, qty: 0, revenue: 0 };
      entry.qty += Number(it.qty);
      entry.revenue += revenue;
      byProduct.set(key, entry);
    }
  }
  return Array.from(byProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export async function getCollectedTrend(months = 6) {
  const company = await getCompany();
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const payments = await prisma.payment.findMany({ where: { invoice: { companyId: company.id } } });
  return keys.map((key) => ({
    month: key,
    total: payments.filter((p) => p.date.toISOString().slice(0, 7) === key).reduce((s, p) => s + Number(p.amount), 0),
  }));
}

export async function getMonthOverMonth() {
  const all = await allInvoicesWithTotals();
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthTotal = all.filter((r) => r.invoice.date.toISOString().slice(0, 7) === thisKey).reduce((s, r) => s + r.totals.total, 0);
  const lastMonthTotal = all.filter((r) => r.invoice.date.toISOString().slice(0, 7) === lastKey).reduce((s, r) => s + r.totals.total, 0);
  return {
    thisMonthLabel: now.toLocaleDateString('en-IN', { month: 'long' }),
    lastMonthLabel: lastDate.toLocaleDateString('en-IN', { month: 'long' }),
    thisMonthTotal,
    lastMonthTotal,
  };
}

export async function getTopCustomers(filters?: ReportFilters) {
  const all = (await allInvoicesWithTotals(filters)).filter((r) => r.invoice.status !== 'DRAFT');
  const byCustomer = new Map<string, { name: string; shopName: string | null; state: string; total: number; balance: number; count: number }>();
  for (const r of all) {
    const key = r.invoice.customerId;
    const entry = byCustomer.get(key) ?? { name: r.invoice.customer.name, shopName: r.invoice.customer.shopName, state: r.invoice.customer.state, total: 0, balance: 0, count: 0 };
    entry.total += r.totals.total;
    entry.balance += Math.max(r.balanceDue, 0);
    entry.count += 1;
    byCustomer.set(key, entry);
  }
  return Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
}
