import { getBillingTrend, getReportStats, getTopCustomers, getStatusBreakdown, getTopProducts } from '@/actions/reports';
import { getCompany } from '@/lib/get-company';
import { ReportsClient } from './reports-client';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  // Seeds the client's react-query hooks with an all-time, unfiltered
  // fetch (the default filter state in reports-client.tsx) so the page
  // renders with real data immediately instead of a loading flash, exactly
  // mirroring the Invoices list's SSR-seed pattern (see invoices/page.tsx).
  const [company, stats, trend, topCustomers, statusBreakdown, topProducts] = await Promise.all([
    getCompany(),
    getReportStats(),
    getBillingTrend(),
    getTopCustomers(),
    getStatusBreakdown(),
    getTopProducts(),
  ]);
  return (
    <ReportsClient
      initialStats={stats}
      initialTrend={trend}
      initialTopCustomers={topCustomers}
      initialStatusBreakdown={statusBreakdown}
      initialTopProducts={topProducts}
      currency={company.currency}
    />
  );
}
