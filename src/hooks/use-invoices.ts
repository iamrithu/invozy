import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteInvoice,
  deletePayment,
  duplicateInvoice,
  getInvoiceShareLink,
  getInvoiceStatusCounts,
  listInvoicesPage,
  markReminded,
  recordPayment,
  type InvoiceListFilters,
} from '@/actions/invoices';
import { unwrap } from '@/lib/action-result';
import { invalidateBusinessData } from '@/hooks/use-invalidate';

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

// Every mutation below unwraps a returned `{ error }` into a thrown Error
// (so callers' try/catch + toast.error(e.message) show the real reason) and
// refreshes every screen an invoice change can show up on.

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => unwrap(await deleteInvoice(invoiceId)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useDuplicateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => unwrap(await duplicateInvoice(invoiceId)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export type PaymentInput = { amount: number; date: string; mode?: string | null; reference?: string | null };

export function useRecordPayment(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentInput) => unwrap(await recordPayment(invoiceId, input)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => unwrap(await deletePayment(paymentId)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

/** Opens WhatsApp with a message and the customer-facing PDF link. The link
 * is fetched first (it's signed server-side), so the click handler opens a
 * blank tab synchronously — a tab opened after an await would be blocked as
 * a popup — and points it at wa.me once the link is ready. */
export function useWhatsAppShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, phone, buildMessage, reminder, win }: { invoiceId: string; phone: string | null; buildMessage: (url: string) => string; reminder?: boolean; win: Window | null }) => {
      const { url } = unwrap(await getInvoiceShareLink(invoiceId));
      const digits = (phone ?? '').replace(/\D/g, '');
      // Indian 10-digit mobiles need the country code for wa.me.
      const to = digits.length === 10 ? `91${digits}` : digits;
      const wa = `https://wa.me/${to}?text=${encodeURIComponent(buildMessage(url!))}`;
      if (win) win.location.href = wa;
      else window.open(wa, '_blank');
      if (reminder) unwrap(await markReminded(invoiceId));
      return { url };
    },
    onError: (_e, vars) => vars.win?.close(),
    onSuccess: (_d, vars) => {
      if (vars.reminder) invalidateBusinessData(queryClient);
    },
  });
}
