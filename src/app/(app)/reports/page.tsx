import { getBillingTrend, getReportStats, getTopCustomers, getStatusBreakdown, getTopProducts, getGstSummary } from '@/actions/reports';
import { getCompany } from '@/lib/get-company';
import { ReportsClient } from './reports-client';
import { parseReportTab } from './report-tabs';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  // Opening on the Overview (the default), the page renders with its
  // all-time, unfiltered figures already in place — the client's default
  // filter state — so it paints with real data instead of a loading flash,
  // mirroring the Invoices list's SSR-seed pattern (see invoices/page.tsx).
  // The profit estimate is left to load client-side (heaviest query, below
  // the fold). A link straight to another tab skips all of this: those
  // tabs load their own data with skeletons, and nothing here would be
  // shown.
  if (parseReportTab(tab) !== 'overview') {
    const company = await getCompany();
    return <ReportsClient currency={company.currency} />;
  }

  const [company, stats, trend, topCustomers, statusBreakdown, topProducts, gst] = await Promise.all([
    getCompany(),
    getReportStats(),
    getBillingTrend(),
    getTopCustomers(),
    getStatusBreakdown(),
    getTopProducts(),
    getGstSummary(),
  ]);
  return <ReportsClient seed={{ stats, trend, topCustomers, statusBreakdown, topProducts, gst }} currency={company.currency} />;
}
