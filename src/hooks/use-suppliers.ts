import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSupplier,
  deleteSupplier,
  listSupplierOptions,
  listSuppliers,
  setSupplierActive,
  updateSupplier,
  type SupplierInput,
  type SupplierRow,
} from '@/actions/suppliers';
import { unwrap } from '@/lib/action-result';
import { invalidateBusinessData } from '@/hooks/use-invalidate';

export const supplierKeys = {
  all: ['suppliers'] as const,
  list: (params: { search: string; includeInactive: boolean }) => [...supplierKeys.all, 'list', params] as const,
  options: (includeId?: string | null) => [...supplierKeys.all, 'options', includeId ?? null] as const,
};

export function useSuppliers(params: { search: string; includeInactive: boolean }, seed?: SupplierRow[]) {
  return useQuery({
    queryKey: supplierKeys.list(params),
    queryFn: () => listSuppliers(params),
    placeholderData: (prev) => prev,
    initialData: seed,
  });
}

/** Active suppliers for pickers (plus `includeId`, so an existing bill still
 * shows a supplier that has since been disabled). */
export function useSupplierOptions(includeId?: string | null) {
  return useQuery({ queryKey: supplierKeys.options(includeId), queryFn: () => listSupplierOptions(includeId), staleTime: 60_000 });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SupplierInput) => unwrap(await createSupplier(input)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SupplierInput }) => unwrap(await updateSupplier(id, input)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useSetSupplierActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => unwrap(await setSupplierActive(id, active)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

/** Not unwrapped: a refusal carries `canDisable`, which the screen uses to
 * offer "Disable instead" right in the confirm dialog. */
export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: (res) => {
      if (!res.error) invalidateBusinessData(queryClient);
    },
  });
}
