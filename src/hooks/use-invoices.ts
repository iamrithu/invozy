import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteInvoice, duplicateInvoice, getInvoiceStatusCounts, listInvoicesPage, recordPayment, type InvoiceListFilters } from '@/actions/invoices';

type StatusCountFilters = { customerId?: string; amountMin?: number; amountMax?: number; gstType?: 'all' | 'intra' | 'inter' };

export const invoiceKeys = {
  all: ['invoices'] as const,
  page: (params: InvoiceListFilters) => [...invoiceKeys.all, 'page', params] as const,
  statusCounts: (search: string, dateFrom: string | undefined, dateTo: string | undefined, opts: StatusCountFilters) =>
    [...invoiceKeys.all, 'status-counts', search, dateFrom, dateTo, opts] as const,
};

export function useInvoiceStatusCounts(search: string, dateFrom?: string, dateTo?: string, opts: StatusCountFilters = {}) {
  return useQuery({
    queryKey: invoiceKeys.statusCounts(search, dateFrom, dateTo, opts),
    queryFn: () => getInvoiceStatusCounts(search, dateFrom, dateTo, opts),
    placeholderData: (prev) => prev,
  });
}

export function useInvoicesPage(params: InvoiceListFilters, seed?: { items: any[]; total: number }) {
  return useQuery({
    queryKey: invoiceKeys.page(params),
    queryFn: () => listInvoicesPage(params),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => deleteInvoice(invoiceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}

export function useDuplicateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => duplicateInvoice(invoiceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}

export function useRecordPayment(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ amount, date }: { amount: number; date: string }) => recordPayment(invoiceId, amount, date),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}
