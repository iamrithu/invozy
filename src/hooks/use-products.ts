import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProduct,
  deleteProduct,
  getProductCategories,
  listProductsPage,
  toggleProductActive,
  updateProduct,
  type ProductFormState,
  type ProductSort,
} from '@/actions/products';

export const productKeys = {
  all: ['products'] as const,
  page: (params: { search: string; category: string; activeOnly: boolean; sort: ProductSort; page: number; pageSize: number }) =>
    [...productKeys.all, 'page', params] as const,
  categories: () => [...productKeys.all, 'categories'] as const,
};

export function useProductCategories() {
  return useQuery({
    queryKey: productKeys.categories(),
    queryFn: () => getProductCategories(),
    staleTime: 30_000,
  });
}

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

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => createProduct({} as ProductFormState, formData),
    onSuccess: (result) => {
      if (!result.error) queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}

export function useUpdateProduct(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => updateProduct(productId, {} as ProductFormState, formData),
    onSuccess: (result) => {
      if (!result.error) queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => deleteProduct(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useToggleProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => toggleProductActive(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}
