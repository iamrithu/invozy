import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryStatus } from '@prisma/client';
import {
  createCategory,
  listCategories,
  listCategoryOptions,
  purgeCategory,
  reorderCategories,
  restoreCategory,
  setCategoryOnStore,
  setCategoryStatus,
  trashCategory,
  updateCategory,
  type CategoryFormState,
  type CategoryRow,
  type CategoryCounts,
} from '@/actions/categories';
import { unwrap } from '@/lib/action-result';
import { invalidateBusinessData } from '@/hooks/use-invalidate';

export const categoryKeys = {
  all: ['categories'] as const,
  list: () => [...categoryKeys.all, 'list'] as const,
  options: () => [...categoryKeys.all, 'options'] as const,
};

export function useCategories(seed?: { rows: CategoryRow[]; counts: CategoryCounts }) {
  return useQuery({ queryKey: categoryKeys.list(), queryFn: () => listCategories(), initialData: seed, staleTime: 10_000 });
}

/** Active categories for pickers (coupons, filters). */
export function useCategoryOptions() {
  return useQuery({ queryKey: categoryKeys.options(), queryFn: () => listCategoryOptions(), staleTime: 60_000 });
}

/** Categories and every product list refresh together: a rename or a move
 * changes what products show. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: categoryKeys.all }), invalidateBusinessData(queryClient)]);
}

function throwFormError(res: CategoryFormState): CategoryFormState {
  if (res.error) {
    const err = new Error(res.error) as Error & { fieldErrors?: Record<string, string> };
    err.fieldErrors = res.fieldErrors;
    throw err;
  }
  return res;
}

export function useSaveCategory() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, formData }: { id?: string; formData: FormData }) =>
      throwFormError(id ? await updateCategory(id, {}, formData) : await createCategory({}, formData)),
    onSuccess: refresh,
  });
}

export function useSetCategoryStatus() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async ({ id, status }: { id: string; status: CategoryStatus }) => unwrap(await setCategoryStatus(id, status)), onSuccess: refresh });
}

export function useSetCategoryOnStore() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async ({ id, show }: { id: string; show: boolean }) => unwrap(await setCategoryOnStore(id, show)), onSuccess: refresh });
}

export function useReorderCategories() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async (ids: string[]) => unwrap(await reorderCategories(ids)), onSuccess: refresh });
}

export function useTrashCategory() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async ({ id, moveTo }: { id: string; moveTo?: string | null }) => unwrap(await trashCategory(id, moveTo)), onSuccess: refresh });
}

export function useRestoreCategory() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async (id: string) => unwrap(await restoreCategory(id)), onSuccess: refresh });
}

export function usePurgeCategory() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async (id: string) => unwrap(await purgeCategory(id)), onSuccess: refresh });
}
