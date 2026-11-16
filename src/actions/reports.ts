'use server';

import { requireUser } from '@/lib/session';
import { todayIst } from '@/lib/dates';
import {
  queryReportStats,
  queryPreviousPeriodStats,
  queryBillingTrend,
  queryStatusBreakdown,
  queryTopProducts,
  queryCollectedTrend,
  queryMonthOverMonth,
  queryTopCustomers,
  queryGstSummary,
  queryProfitEstimate,
  querySalesAnalysis,
  querySalesByWeekday,
  queryReceivables,
  queryCollections,
  queryInventoryInsights,
  type ReportFilters,
  type SalesDimension,
} from '@/app/(app)/reports/report-queries';
import { loadLoadingSheet, normalizeLoadingParams, type LoadingSheet } from '@/app/(app)/reports/loading-sheet/loading-sheet-data';
import { requireModule } from '@/lib/require-module';

// The Reports endpoints — each checks the session, then runs its query from
// src/app/(app)/reports/report-queries.ts, where the SQL and the rules
// behind every figure are documented. Kept this thin on purpose: the print
// page for the monthly report PDF needs the same queries without a session,
// and a session-free function exported from this 'use server' file would be
// a public endpoint.

export type {
  ReportFilters,
  TrendPoint,
  StatusBreakdownPoint,
  TopProduct,
  TopProducts,
  TaxHeads,
  GstSummary,
  ProfitRow,
  ProfitEstimate,
  SalesDimension,
  SalesRow,
  SalesAnalysis,
  ProfitTotals,
  WeekdayPoint,
  AgeingBucket,
  AgeingAmounts,
  ReceivableRow,
  Receivables,
  PaymentModeRow,
  LargePayment,
  CollectionsReport,
  FastMover,
  SlowStockItem,
  RunningLowItem,
  InventoryInsights,
} from '@/app/(app)/reports/report-queries';

/** Taxable value, tax heads, total and outstanding for the filtered invoices. */
export async function getReportStats(filters?: ReportFilters) {
  await requireModule('reports');
  await requireUser();
  return queryReportStats(filters);
}

/** The same stats for the previous equal-length period — null for an
 * open-ended range ("All time"). */
export async function getPreviousPeriodStats(filters?: ReportFilters) {
  await requireModule('reports');
  await requireUser();
  return queryPreviousPeriodStats(filters);
}

/** Billed vs collected per day or month (the dashboard calls it bare). */
export async function getBillingTrend(filters?: ReportFilters) {
  await requireModule('reports');
  await requireUser();
  return queryBillingTrend(filters);
}

export async function getStatusBreakdown(filters?: ReportFilters) {
  await requireModule('reports');
  await requireUser();
  return queryStatusBreakdown(filters);
}

/** Best sellers by value and by main-unit quantity (Reports and dashboard). */
export async function getTopProducts(filters?: ReportFilters, limit?: number) {
  await requireUser();
  return queryTopProducts(filters, limit);
}

/** Payments per calendar month for the last `months` months. */
export async function getCollectedTrend(months?: number) {
  await requireModule('reports');
  await requireUser();
  return queryCollectedTrend(months);
}

export async function getMonthOverMonth() {
  await requireModule('reports');
  await requireUser();
  return queryMonthOverMonth();
}

/** Customers ranked by billing (Reports and dashboard). */
export async function getTopCustomers(filters?: ReportFilters, limit?: number) {
  await requireUser();
  return queryTopCustomers(filters, limit);
}

export async function getGstSummary(filters?: ReportFilters) {
  await requireModule('reports');
  await requireUser();
  return queryGstSummary(filters);
}

export async function getProfitEstimate(filters?: ReportFilters, limit?: number) {
  await requireModule('reports');
  await requireUser();
  return queryProfitEstimate(filters, limit);
}

/** Sales by customer, product or category vs the previous period, with cost
 * and profit (Sales analysis tab). */
export async function getSalesAnalysis(filters: ReportFilters | undefined, by: SalesDimension) {
  await requireModule('reports');
  await requireUser();
  return querySalesAnalysis(filters, by);
}

export async function getSalesByWeekday(filters?: ReportFilters) {
  await requireUser();
  return querySalesByWeekday(filters);
}

/** Ageing of what customers owe, DSO and collection rate (Receivables tab). */
export async function getReceivables(filters?: ReportFilters) {
  await requireModule('reports');
  await requireUser();
  return queryReceivables(filters);
}

/** Money received in the period by mode and over time (Collections tab). */
export async function getCollections(filters?: ReportFilters) {
  await requireModule('reports');
  await requireUser();
  return queryCollections(filters);
}

/** Stock value, fast/slow movers and what's running low (Inventory tab). */
export async function getInventoryInsights(filters?: ReportFilters) {
  await requireModule('reports');
  await requireUser();
  return queryInventoryInsights(filters);
}

// ---------------------------------------------------------------------------
// Daily loading sheet
// ---------------------------------------------------------------------------

/** One day's loading sheet (load list + drop list per vehicle or route) —
 * see src/app/(app)/reports/loading-sheet/loading-sheet-data.ts. Input is
 * normalised there, so a hand-edited URL can't break the query. */
export async function getLoadingSheet(input: { date?: string; group?: string; includeDrafts?: boolean }): Promise<LoadingSheet> {
  await requireModule('reports');
  await requireUser();
  return loadLoadingSheet(normalizeLoadingParams({ date: input.date, group: input.group, drafts: input.includeDrafts ?? false }, todayIst()));
}
