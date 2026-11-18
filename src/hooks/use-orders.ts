import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderSource } from '@prisma/client';
import {
  cancelOrder,
  confirmOrder,
  confirmOrders,
  createOrder,
  deleteDraftOrder,
  deliverOrder,
  dispatchOrder,
  generateOrderInvoice,
  generateOrderInvoices,
  getOrder,
  listOrders,
  packOrder,
  pendingOrderCount,
  updateOrder,
  type OrderInput,
  type OrderTab,
  type OrderView,
  type SaveMode,
} from '@/actions/orders';
import { unwrap } from '@/lib/action-result';
import { invalidateBusinessData } from '@/hooks/use-invalidate';

export const orderKeys = {
  all: ['orders'] as const,
  list: (p: { tab: OrderTab; source: OrderSource | 'all'; search: string; page: number }) => [...orderKeys.all, 'list', p] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
  pending: () => [...orderKeys.all, 'pending'] as const,
};

export function useOrders(p: { tab: OrderTab; source: OrderSource | 'all'; search: string; page: number }, seed?: Awaited<ReturnType<typeof listOrders>>) {
  return useQuery({
    queryKey: orderKeys.list(p),
    queryFn: () => listOrders({ ...p, pageSize: 25 }),
    placeholderData: (prev) => prev,
    initialData: seed,
    staleTime: 5_000,
  });
}

export function useOrder(id: string, seed?: OrderView | null) {
  return useQuery({ queryKey: orderKeys.detail(id), queryFn: () => getOrder(id), initialData: seed ?? undefined, staleTime: 5_000 });
}

/** Web orders waiting for confirmation — the sidebar badge. */
export function usePendingOrderCount(enabled = true) {
  return useQuery({ queryKey: orderKeys.pending(), queryFn: () => pendingOrderCount(), staleTime: 30_000, refetchInterval: 120_000, enabled });
}

/** Orders change invoices, stock, customers' balances and reports. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: orderKeys.all }), invalidateBusinessData(queryClient)]);
}

type Result = { error?: string; warning?: string; id?: string; number?: string; invoiceNumber?: string };
const ok = (r: Result) => unwrap(r);

export function useCreateOrder() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { input: OrderInput; mode: SaveMode; paid?: boolean; paymentMode?: string | null; allowNegativeStock?: boolean }) =>
      ok(await createOrder(v.input, v.mode, { paid: v.paid, paymentMode: v.paymentMode, allowNegativeStock: v.allowNegativeStock })),
    onSuccess: refresh,
  });
}

export function useUpdateOrder() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async (v: { id: string; input: OrderInput }) => ok(await updateOrder(v.id, v.input)), onSuccess: refresh });
}

export function useOrderAction() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (
      v:
        | { kind: 'confirm'; id: string }
        | { kind: 'pack'; id: string }
        | { kind: 'invoice'; id: string; allowNegativeStock?: boolean }
        | { kind: 'dispatch'; id: string; vehicleNo?: string; driverName?: string; driverPhone?: string; generateInvoice?: boolean; allowNegativeStock?: boolean }
        | { kind: 'deliver'; id: string; collected?: boolean; mode?: string }
        | { kind: 'cancel'; id: string; reason: string }
        | { kind: 'delete'; id: string }
    ): Promise<Result> => {
      switch (v.kind) {
        case 'confirm':
          return ok(await confirmOrder(v.id));
        case 'pack':
          return ok(await packOrder(v.id));
        case 'invoice':
          return ok(await generateOrderInvoice(v.id, { allowNegativeStock: v.allowNegativeStock }));
        case 'dispatch':
          return ok(await dispatchOrder(v.id, v));
        case 'deliver':
          return ok(await deliverOrder(v.id, { collected: v.collected, mode: v.mode }));
        case 'cancel':
          return ok(await cancelOrder(v.id, v.reason));
        case 'delete':
          return ok((await deleteDraftOrder(v.id)) as Result);
      }
    },
    onSuccess: refresh,
  });
}

export function useBulkOrderAction() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { kind: 'confirm' | 'invoice'; ids: string[] }) => {
      const r = v.kind === 'confirm' ? await confirmOrders(v.ids) : await generateOrderInvoices(v.ids);
      return unwrap(r);
    },
    onSuccess: refresh,
  });
}
