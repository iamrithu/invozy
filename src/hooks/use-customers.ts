import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCustomer,
  deleteCustomer,
  getCustomerLedger,
  listCustomerStates,
  listCustomersForFilter,
  listCustomersPage,
  updateCustomer,
  type CustomerFormState,
  type CustomerSort,
} from '@/actions/customers';

export const customerKeys = {
  all: ['customers'] as const,
  page: (params: { search: string; state: string; sort: CustomerSort; page: number; pageSize: number }) => [...customerKeys.all, 'page', params] as const,
  states: () => [...customerKeys.all, 'states'] as const,
  ledger: (id: string) => [...customerKeys.all, 'ledger', id] as const,
  filterOptions: () => [...customerKeys.all, 'filter-options'] as const,
};

/** The full customer directory (id + display name), for the "Customer"
 * filter dropdown on the Invoices and Reports list screens — see
 * listCustomersForFilter's doc comment for why this is distinct from the
 * capped/search-gated lookups above. Rarely changes within a session, so
 * this is cached generously rather than refetched on every filter-bar
 * mount. */
export function useCustomersForFilter() {
  return useQuery({
    queryKey: customerKeys.filterOptions(),
    queryFn: () => listCustomersForFilter(),
    staleTime: 60_000,
  });
}

export function useCustomersPage(
  params: { search: string; state: string; sort: CustomerSort; page: number; pageSize: number },
  seed?: { items: any[]; total: number }
) {
  return useQuery({
    queryKey: customerKeys.page(params),
    queryFn: () => listCustomersPage(params),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

export function useCustomerStates() {
  return useQuery({
    queryKey: customerKeys.states(),
    queryFn: () => listCustomerStates(),
    staleTime: 60_000,
  });
}

export function useCustomerLedger(customerId: string) {
  return useQuery({
    queryKey: customerKeys.ledger(customerId),
    queryFn: () => getCustomerLedger(customerId),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ guest, formData }: { guest: boolean; formData: FormData }) => createCustomer(guest, {} as CustomerFormState, formData),
    onSuccess: (result) => {
      if (!result.error) queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

export function useUpdateCustomer(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => updateCustomer(customerId, {} as CustomerFormState, formData),
    onSuccess: (result) => {
      if (!result.error) queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) => deleteCustomer(customerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.all }),
  });
}
