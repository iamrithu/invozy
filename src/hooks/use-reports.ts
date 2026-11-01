import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getReportStats,
  getBillingTrend,
  getTopCustomers,
  getPreviousPeriodStats,
  getStatusBreakdown,
  getTopProducts,
  getGstSummary,
  getProfitEstimate,
  getLoadingSheet,
  type ReportFilters,
} from '@/actions/reports';
import { getTallyLedgers, updateTallyLedgers } from '@/actions/exports';
import { unwrap } from '@/lib/action-result';
import type { TallyLedgers } from '@/lib/tally';
import type { LoadingSheetParams } from '@/app/(app)/reports/loading-sheet/loading-sheet-data';

// Everything here lives under ['reports'], which src/hooks/use-invalidate.ts
// refreshes after any invoice/payment/stock change — so a sale recorded on
// another screen shows up in the GST summary, profit and loading sheet
// without each mutation having to know these exist.

export const reportKeys = {
  all: ['reports'] as const,
  stats: (filters: ReportFilters) => [...reportKeys.all, 'stats', filters] as const,
  previousStats: (filters: ReportFilters) => [...reportKeys.all, 'previous-stats', filters] as const,
  trend: (filters: ReportFilters) => [...reportKeys.all, 'trend', filters] as const,
  topCustomers: (filters: ReportFilters) => [...reportKeys.all, 'top-customers', filters] as const,
  statusBreakdown: (filters: ReportFilters) => [...reportKeys.all, 'status-breakdown', filters] as const,
  topProducts: (filters: ReportFilters) => [...reportKeys.all, 'top-products', filters] as const,
  gst: (filters: ReportFilters) => [...reportKeys.all, 'gst', filters] as const,
  profit: (filters: ReportFilters) => [...reportKeys.all, 'profit', filters] as const,
  loadingSheet: (params: LoadingSheetParams) => [...reportKeys.all, 'loading-sheet', params] as const,
  tallyLedgers: () => [...reportKeys.all, 'tally-ledgers'] as const,
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

export function useGstSummary(filters: ReportFilters, seed?: Awaited<ReturnType<typeof getGstSummary>>) {
  return useQuery({
    queryKey: reportKeys.gst(filters),
    queryFn: () => getGstSummary(filters),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

export function useProfitEstimate(filters: ReportFilters, seed?: Awaited<ReturnType<typeof getProfitEstimate>>) {
  return useQuery({
    queryKey: reportKeys.profit(filters),
    queryFn: () => getProfitEstimate(filters),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

/** `seed` is the server-rendered sheet for the URL's own params — only
 * used while the params still match it. */
export function useLoadingSheet(params: LoadingSheetParams, seed?: Awaited<ReturnType<typeof getLoadingSheet>>) {
  const seedMatches = !!seed && seed.date === params.date && seed.group === params.group && seed.includeDrafts === params.includeDrafts;
  return useQuery({
    queryKey: reportKeys.loadingSheet(params),
    queryFn: () => getLoadingSheet(params),
    placeholderData: (prev) => prev,
    ...(seedMatches ? { initialData: seed } : {}),
  });
}

/** Owner-only — the Tally ledger names dialog loads these when it opens. */
export function useTallyLedgers(enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.tallyLedgers(),
    queryFn: async () => unwrap(await getTallyLedgers()).ledgers!,
    enabled,
    staleTime: Infinity,
  });
}

export function useUpdateTallyLedgers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ledgers: TallyLedgers) => unwrap(await updateTallyLedgers(ledgers)),
    onSuccess: (res) => {
      if (res.ledgers) queryClient.setQueryData(reportKeys.tallyLedgers(), res.ledgers);
    },
  });
}
