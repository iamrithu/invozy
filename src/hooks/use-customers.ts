import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCustomer,
  deleteCustomer,
  getCustomerLedger,
  listCustomerRoutes,
  listCustomerStates,
  listCustomersForFilter,
  listCustomersPage,
  toggleCustomerActive,
  updateCustomer,
  type CustomerFormState,
  type CustomerSort,
  type CustomerStatus,
} from '@/actions/customers';
import { unwrap } from '@/lib/action-result';
import { useInvalidateBusinessData } from '@/hooks/use-invalidate';

export type CustomersPageParams = {
  search: string;
  state: string;
  sort: CustomerSort;
  status: CustomerStatus;
  includeGuests: boolean;
  page: number;
  pageSize: number;
};

export const customerKeys = {
  all: ['customers'] as const,
  page: (params: CustomersPageParams) => [...customerKeys.all, 'page', params] as const,
  states: () => [...customerKeys.all, 'states'] as const,
  routes: () => [...customerKeys.all, 'routes'] as const,
  ledger: (id: string) => [...customerKeys.all, 'ledger', id] as const,
  filterOptions: () => [...customerKeys.all, 'filter-options'] as const,
};

/** Thrown by useDeleteCustomer when the server refuses the delete because
 * the customer has invoices on file — `canDisable` tells the confirm
 * dialog to swap to its "Disable customer" action. */
export type CustomerDeleteError = Error & { canDisable?: boolean };

/** The full customer directory (id + display name + active flag), for the
 * "Customer" filter dropdown on the Invoices and Reports list screens —
 * see listCustomersForFilter's doc comment for why this is distinct from
 * the capped/search-gated lookups above. Rarely changes within a session,
 * so this is cached generously rather than refetched on every filter-bar
 * mount. */
export function useCustomersForFilter() {
  return useQuery({
    queryKey: customerKeys.filterOptions(),
    queryFn: () => listCustomersForFilter(),
    staleTime: 60_000,
  });
}

export type CustomersPageData = Awaited<ReturnType<typeof listCustomersPage>>;

export function useCustomersPage(params: CustomersPageParams, seed?: CustomersPageData) {
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

export function useCustomerRoutes() {
  return useQuery({
    queryKey: customerKeys.routes(),
    queryFn: () => listCustomerRoutes(),
    staleTime: 60_000,
  });
}

/** `customerId` may be null (nothing selected yet) — the query just waits. */
export function useCustomerLedger(customerId: string | null) {
  return useQuery({
    queryKey: customerKeys.ledger(customerId ?? ''),
    queryFn: () => getCustomerLedger(customerId!),
    enabled: !!customerId,
  });
}

// Create/update keep returning their { error, fieldErrors } result instead
// of throwing — forms (here and in the invoice builder) read fieldErrors off
// it to highlight fields. The actions themselves never throw.

export function useCreateCustomer() {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: ({ guest, formData }: { guest: boolean; formData: FormData }) => createCustomer(guest, {} as CustomerFormState, formData),
    onSuccess: (result) => {
      if (!result.error) invalidate();
    },
  });
}

export function useUpdateCustomer(customerId: string) {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: (formData: FormData) => updateCustomer(customerId, {} as CustomerFormState, formData),
    onSuccess: (result) => {
      if (!result.error) invalidate();
    },
  });
}

export function useToggleCustomerActive() {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active?: boolean }) => unwrap(await toggleCustomerActive(id, active)),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: async (customerId: string) => {
      const res = await deleteCustomer(customerId);
      if (res.error) throw Object.assign(new Error(res.error), { canDisable: !!res.canDisable }) as CustomerDeleteError;
      return res;
    },
    onSuccess: (_res, customerId) => {
      // The open sheet's ledger query would otherwise be refetched for a
      // customer that no longer exists — and retried with backoff, holding
      // the dialog on "Please wait…" for seconds.
      queryClient.removeQueries({ queryKey: customerKeys.ledger(customerId), exact: true });
      return invalidate();
    },
  });
}
