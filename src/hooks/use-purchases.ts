import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deletePurchase, getPurchaseSummary, listPurchasesPage, savePurchase, type PurchaseInput, type PurchaseListItem } from '@/actions/purchases';
import { unwrap } from '@/lib/action-result';
import { invalidateBusinessData } from '@/hooks/use-invalidate';

export type PurchasesPageParams = { search: string; supplierId: string; page: number; pageSize: number };

export const purchaseKeys = {
  all: ['purchases'] as const,
  page: (params: PurchasesPageParams) => [...purchaseKeys.all, 'page', params] as const,
  summary: () => [...purchaseKeys.all, 'summary'] as const,
};

export function usePurchasesPage(params: PurchasesPageParams, seed?: { items: PurchaseListItem[]; total: number }) {
  return useQuery({
    queryKey: purchaseKeys.page(params),
    queryFn: () => listPurchasesPage(params),
    placeholderData: (prev) => prev,
    initialData: seed,
  });
}

export function usePurchaseSummary(seed?: Awaited<ReturnType<typeof getPurchaseSummary>>) {
  return useQuery({ queryKey: purchaseKeys.summary(), queryFn: () => getPurchaseSummary(), initialData: seed });
}

export function useSavePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: PurchaseInput }) => unwrap(await savePurchase(id, input)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useDeletePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deletePurchase(id)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}
