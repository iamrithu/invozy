import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCompanyWithUser, getCompanyForAdmin, listCompaniesForAdmin, resetUserPassword, type CreateCompanyFormState, type ResetPasswordFormState } from '@/actions/admin';

export const adminKeys = {
  all: ['admin-companies'] as const,
  page: (params: { search: string; page: number; pageSize: number }) => [...adminKeys.all, 'page', params] as const,
  detail: (id: string) => [...adminKeys.all, 'detail', id] as const,
};

export function useCompaniesForAdmin(params: { search: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: adminKeys.page(params),
    queryFn: () => listCompaniesForAdmin(params),
    placeholderData: (prev) => prev,
  });
}

export function useCompanyForAdmin(id: string, seed?: NonNullable<Awaited<ReturnType<typeof getCompanyForAdmin>>>) {
  return useQuery({
    queryKey: adminKeys.detail(id),
    queryFn: () => getCompanyForAdmin(id),
    ...(seed ? { initialData: seed } : {}),
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => createCompanyWithUser({} as CreateCompanyFormState, formData),
    onSuccess: (result) => {
      if (!result.error) queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (formData: FormData) => resetUserPassword({} as ResetPasswordFormState, formData),
  });
}
