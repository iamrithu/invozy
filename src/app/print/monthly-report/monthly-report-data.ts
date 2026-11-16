import { todayIst } from '@/lib/dates';
import {
  queryCollections,
  queryGstSummary,
  queryReceivables,
  queryReportStats,
  querySalesAnalysis,
  type CollectionsReport,
  type GstSummary,
  type Receivables,
  type SalesAnalysis,
  type SalesRow,
} from '@/app/(app)/reports/report-queries';
import { monthLabel, monthRange, previousMonth } from './month';

// Everything the monthly report PDF prints, from the same queries as the
// Reports page (src/app/(app)/reports/report-queries.ts) — so the PDF and
// the screen never disagree. Server-only and session-free: the print page
// calls it after checking its signed token.

export type Kpi = { label: string; current: number | null; previous: number | null; kind: 'money' | 'count' | 'days' | 'pct' };

export type MonthlyReport = {
  month: string;
  label: string;
  prevLabel: string;
  from: string;
  to: string;
  /** Today (IST) — what receivables are aged to. */
  asOf: string;
  kpis: Kpi[];
  sales: SalesAnalysis['totals'];
  topCustomers: SalesRow[];
  customerCount: number;
  topProducts: SalesRow[];
  productCount: number;
  collections: CollectionsReport;
  /** Every unpaid invoice dated up to the month's end, aged as of today. */
  receivables: Receivables;
  gst: GstSummary;
};

const TOP = 10;

export async function loadMonthlyReport(month: string): Promise<MonthlyReport> {
  const cur = monthRange(month);
  const prevMonth = previousMonth(month);
  const prev = monthRange(prevMonth);
  const curFilters = { dateFrom: cur.from, dateTo: cur.to };
  const prevFilters = { dateFrom: prev.from, dateTo: prev.to };

  const [stats, prevStats, byCustomer, byProduct, prevSales, collections, prevCollections, receivables, gst] = await Promise.all([
    queryReportStats(curFilters),
    queryReportStats(prevFilters),
    querySalesAnalysis(curFilters, 'customer'),
    querySalesAnalysis(curFilters, 'product'),
    // The calendar month before, not the sales analysis's equal-length
    // window (which for October would start on 31 August).
    querySalesAnalysis(prevFilters, 'product'),
    queryCollections(curFilters),
    queryCollections(prevFilters),
    queryReceivables({ dateTo: cur.to }),
    queryGstSummary(curFilters),
  ]);

  const s = byProduct.totals;
  const p = prevSales.totals;
  const tax = (x: { cgst: number; sgst: number; igst: number }) => x.cgst + x.sgst + x.igst;
  const kpis: Kpi[] = [
    { label: 'Net sales (taxable, after credit notes)', current: s.revenue, previous: p.revenue, kind: 'money' },
    { label: 'Invoices issued', current: s.invoices, previous: p.invoices, kind: 'count' },
    { label: 'Average invoice (taxable)', current: s.invoices ? s.revenue / s.invoices : 0, previous: p.invoices ? p.revenue / p.invoices : 0, kind: 'money' },
    { label: 'Total billed (with GST)', current: stats.total, previous: prevStats.total, kind: 'money' },
    { label: 'GST charged', current: tax(stats), previous: tax(prevStats), kind: 'money' },
    { label: 'Estimated gross profit', current: s.profit, previous: p.profit, kind: 'money' },
    { label: 'Collected', current: collections.total, previous: prevCollections.total, kind: 'money' },
    { label: 'Still unpaid on the month’s invoices', current: stats.outstanding, previous: prevStats.outstanding, kind: 'money' },
    { label: 'Average days to get paid', current: collections.avgDaysToPay, previous: prevCollections.avgDaysToPay, kind: 'days' },
  ];

  const sold = (r: SalesRow) => r.revenue > 0.004;
  return {
    month,
    label: monthLabel(month),
    prevLabel: monthLabel(prevMonth),
    from: cur.from,
    to: cur.to,
    asOf: todayIst(),
    kpis,
    sales: s,
    topCustomers: byCustomer.rows.filter(sold).slice(0, TOP),
    customerCount: byCustomer.rows.filter(sold).length,
    topProducts: byProduct.rows.filter(sold).slice(0, TOP),
    productCount: byProduct.rows.filter(sold).length,
    collections,
    receivables,
    gst,
  };
}
