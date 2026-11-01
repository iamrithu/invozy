import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createProduct,
  deleteProduct,
  getProductCategories,
  listProductOptions,
  listProductsPage,
  toggleProductActive,
  updateProduct,
  type ProductFormState,
  type ProductSort,
} from '@/actions/products';
import { unwrap } from '@/lib/action-result';
import { useInvalidateBusinessData } from '@/hooks/use-invalidate';

export const productKeys = {
  all: ['products'] as const,
  page: (params: { search: string; category: string; activeOnly: boolean; sort: ProductSort; page: number; pageSize: number }) =>
    [...productKeys.all, 'page', params] as const,
  categories: () => [...productKeys.all, 'categories'] as const,
  options: () => [...productKeys.all, 'options'] as const,
};

export function useProductCategories() {
  return useQuery({
    queryKey: productKeys.categories(),
    queryFn: () => getProductCategories(),
    staleTime: 30_000,
  });
}

/** Every live product with its price tiers — for pickers that need the
 * whole catalog up front (a customer's special prices). */
export function useProductOptions(enabled = true) {
  return useQuery({
    queryKey: productKeys.options(),
    queryFn: () => listProductOptions(),
    staleTime: 60_000,
    enabled,
  });
}

export type ProductOption = Awaited<ReturnType<typeof listProductOptions>>[number];

export function useProductsPage(
  params: { search: string; category: string; activeOnly: boolean; sort: ProductSort; page: number; pageSize: number },
  seed?: { items: any[]; total: number }
) {
  return useQuery({
    queryKey: productKeys.page(params),
    queryFn: () => listProductsPage(params),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

// Create/update keep returning their { error, fieldErrors } result instead
// of throwing — forms (here and in the invoice builder) read fieldErrors off
// it to highlight fields. The actions themselves never throw.

export function useCreateProduct() {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: (formData: FormData) => createProduct({} as ProductFormState, formData),
    onSuccess: (result) => {
      if (!result.error) invalidate();
    },
  });
}

export function useUpdateProduct(productId: string) {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: (formData: FormData) => updateProduct(productId, {} as ProductFormState, formData),
    onSuccess: (result) => {
      if (!result.error) invalidate();
    },
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: async (productId: string) => unwrap(await deleteProduct(productId)),
    onSuccess: () => invalidate(),
  });
}

/** Pass `active` to set Live/Hidden explicitly; omit it to flip. */
export function useToggleProductActive() {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: async (input: string | { id: string; active?: boolean }) => {
      const { id, active } = typeof input === 'string' ? { id: input, active: undefined } : input;
      return unwrap(await toggleProductActive(id, active));
    },
    onSuccess: () => invalidate(),
  });
}
