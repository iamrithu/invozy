import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addStockMovement,
  getStockLedger,
  listInventoryPage,
  listStockProducts,
  setLowStockLevel,
  setStockCount,
  setTrackStock,
  undoStockCount,
  type InventoryPage,
  type InventoryStatusFilter,
  type LedgerTypeGroup,
  type StockLedger,
  type StockMovementInput,
} from '@/actions/inventory';
import { unwrap } from '@/lib/action-result';
import { invalidateBusinessData } from '@/hooks/use-invalidate';

export type InventoryPageParams = { search: string; category: string; status: InventoryStatusFilter; page: number; pageSize: number };
export type LedgerParams = { type: LedgerTypeGroup; dateFrom: string; dateTo: string; page: number };

export const inventoryKeys = {
  all: ['inventory'] as const,
  page: (params: InventoryPageParams) => [...inventoryKeys.all, 'page', params] as const,
  ledger: (productId: string, params: LedgerParams) => [...inventoryKeys.all, 'ledger', productId, params] as const,
  products: () => [...inventoryKeys.all, 'products'] as const,
};

/** `seed` is the server-rendered first page — passed only while the
 * screen is still on its default filters, so it never stands in for a
 * different query. */
export function useInventoryPage(params: InventoryPageParams, seed?: InventoryPage) {
  return useQuery({
    queryKey: inventoryKeys.page(params),
    queryFn: () => listInventoryPage(params),
    placeholderData: (prev) => prev,
    initialData: seed,
  });
}

export function useStockLedger(productId: string, params: LedgerParams, seed?: StockLedger | null) {
  return useQuery({
    queryKey: inventoryKeys.ledger(productId, params),
    queryFn: () =>
      getStockLedger(productId, {
        type: params.type,
        dateFrom: params.dateFrom || undefined,
        dateTo: params.dateTo || undefined,
        page: params.page,
      }),
    placeholderData: (prev) => prev,
    initialData: seed ?? undefined,
  });
}

/** All live products with stock fields, for the Stock in drawer's picker. */
export function useStockProducts(enabled = true) {
  return useQuery({ queryKey: inventoryKeys.products(), queryFn: () => listStockProducts(), staleTime: 30_000, enabled });
}

// Every stock change can show up on the dashboard, reports, product search
// and the invoice builder's stock hints, so each mutation refreshes all
// business data rather than just the inventory keys.

export function useSetStockCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, counted, note }: { productId: string; counted: number; note?: string }) => unwrap(await setStockCount(productId, counted, note)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useUndoStockCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, ...undo }: { productId: string; previous: number; counted: number; startedTracking: boolean }) =>
      unwrap(await undoStockCount(productId, undo)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useAddStockMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, input }: { productId: string; input: StockMovementInput }) => unwrap(await addStockMovement(productId, input)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useSetTrackStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, on }: { productId: string; on: boolean }) => unwrap(await setTrackStock(productId, on)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useSetLowStockLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, level }: { productId: string; level: number | null }) => unwrap(await setLowStockLevel(productId, level)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}
