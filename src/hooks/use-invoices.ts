import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteInvoice, duplicateInvoice, getInvoiceStatusCounts, listInvoicesPage, recordPayment, type InvoiceSort } from '@/actions/invoices';

export const invoiceKeys = {
  all: ['invoices'] as const,
  page: (params: { status: string; search: string; sort: InvoiceSort; page: number; pageSize: number; dateFrom?: string; dateTo?: string }) =>
    [...invoiceKeys.all, 'page', params] as const,
  statusCounts: (search: string, dateFrom?: string, dateTo?: string) => [...invoiceKeys.all, 'status-counts', search, dateFrom, dateTo] as const,
};

export function useInvoiceStatusCounts(search: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: invoiceKeys.statusCounts(search, dateFrom, dateTo),
    queryFn: () => getInvoiceStatusCounts(search, dateFrom, dateTo),
    placeholderData: (prev) => prev,
  });
}

export function useInvoicesPage(
  params: { status: string; search: string; sort: InvoiceSort; page: number; pageSize: number; dateFrom?: string; dateTo?: string },
  seed?: { items: any[]; total: number }
) {
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
