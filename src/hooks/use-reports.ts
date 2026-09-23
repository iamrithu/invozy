import { useQuery } from '@tanstack/react-query';
import { getReportStats, getBillingTrend, getTopCustomers, getPreviousPeriodStats, getStatusBreakdown, getTopProducts, type ReportFilters } from '@/actions/reports';

export const reportKeys = {
  all: ['reports'] as const,
  stats: (filters: ReportFilters) => [...reportKeys.all, 'stats', filters] as const,
  previousStats: (filters: ReportFilters) => [...reportKeys.all, 'previous-stats', filters] as const,
  trend: (filters: ReportFilters) => [...reportKeys.all, 'trend', filters] as const,
  topCustomers: (filters: ReportFilters) => [...reportKeys.all, 'top-customers', filters] as const,
  statusBreakdown: (filters: ReportFilters) => [...reportKeys.all, 'status-breakdown', filters] as const,
  topProducts: (filters: ReportFilters) => [...reportKeys.all, 'top-products', filters] as const,
};

export function useReportStats(filters: ReportFilters, seed?: Awaited<ReturnType<typeof getReportStats>>) {
  return useQuery({
    queryKey: reportKeys.stats(filters),
    queryFn: () => getReportStats(filters),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

/** `null` when the current filter has no bounded date range (e.g. "All
 * time") — see getPreviousPeriodStats' doc comment for why that has no
 * well-defined previous period to compare against. */
export function usePreviousPeriodStats(filters: ReportFilters) {
  return useQuery({
    queryKey: reportKeys.previousStats(filters),
    queryFn: () => getPreviousPeriodStats(filters),
    placeholderData: (prev) => prev,
  });
}

export function useBillingTrend(filters: ReportFilters, seed?: Awaited<ReturnType<typeof getBillingTrend>>) {
  return useQuery({
    queryKey: reportKeys.trend(filters),
    queryFn: () => getBillingTrend(filters),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

export function useTopCustomers(filters: ReportFilters, seed?: Awaited<ReturnType<typeof getTopCustomers>>) {
  return useQuery({
    queryKey: reportKeys.topCustomers(filters),
    queryFn: () => getTopCustomers(filters),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

export function useStatusBreakdown(filters: ReportFilters, seed?: Awaited<ReturnType<typeof getStatusBreakdown>>) {
  return useQuery({
    queryKey: reportKeys.statusBreakdown(filters),
    queryFn: () => getStatusBreakdown(filters),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

export function useTopProducts(filters: ReportFilters, seed?: Awaited<ReturnType<typeof getTopProducts>>) {
  return useQuery({
    queryKey: reportKeys.topProducts(filters),
    queryFn: () => getTopProducts(filters),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}
