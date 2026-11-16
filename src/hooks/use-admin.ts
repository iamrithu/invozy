import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCompanyWithUser,
  getCompanyForAdmin,
  getPlatformStats,
  listCompaniesForAdmin,
  resetUserPassword,
  setCompanyActive,
  setCompanyModules,
  setUserActiveForAdmin,
  type AdminCompanyDetail,
  type AdminCompanyStatus,
  type CreateCompanyFormState,
  type PlatformStats,
  type ResetPasswordFormState,
} from '@/actions/admin';

export type CompanyListParams = { search: string; status: AdminCompanyStatus; page: number; pageSize: number };

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
  page: (params: CompanyListParams) => [...adminKeys.all, 'companies', params] as const,
  detail: (id: string) => [...adminKeys.all, 'company', id] as const,
};

export function useCompaniesForAdmin(params: CompanyListParams) {
  return useQuery({
    queryKey: adminKeys.page(params),
    queryFn: () => listCompaniesForAdmin(params),
    placeholderData: (prev) => prev,
  });
}

export function usePlatformStats(seed?: PlatformStats) {
  return useQuery({ queryKey: adminKeys.stats(), queryFn: () => getPlatformStats(), ...(seed ? { initialData: seed } : {}) });
}

export function useCompanyForAdmin(id: string, seed?: AdminCompanyDetail) {
  return useQuery({
    queryKey: adminKeys.detail(id),
    queryFn: () => getCompanyForAdmin(id),
    ...(seed ? { initialData: seed } : {}),
  });
}

/** Every admin write refreshes every admin view — lists, stats, details. */
function useAdminMutation<A, R extends { error?: string }>(fn: (args: A) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      if (!result.error) queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

export function useCreateCompany() {
  return useAdminMutation((formData: FormData) => createCompanyWithUser({} as CreateCompanyFormState, formData));
}

export function useResetUserPassword() {
  return useAdminMutation((formData: FormData) => resetUserPassword({} as ResetPasswordFormState, formData));
}

export function useSetCompanyActive() {
  return useAdminMutation(({ companyId, active }: { companyId: string; active: boolean }) => setCompanyActive(companyId, active));
}

export function useSetCompanyModules() {
  return useAdminMutation(({ companyId, disabled }: { companyId: string; disabled: string[] }) => setCompanyModules(companyId, disabled));
}

export function useSetUserActive() {
  return useAdminMutation(({ userId, active }: { userId: string; active: boolean }) => setUserActiveForAdmin(userId, active));
}
