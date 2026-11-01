import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyCreditToInvoice,
  createCreditNote,
  deleteCreditNote,
  deleteRefund,
  listCreditNotesPage,
  listInvoicesForCredit,
  recordRefund,
  removeCreditAdjustment,
  searchInvoicesForCreditNote,
  type CreditNoteInput,
  type CreditNoteListFilters,
  type CreditNoteListRow,
} from '@/actions/credit-notes';
import { unwrap } from '@/lib/action-result';
import { invalidateBusinessData } from '@/hooks/use-invalidate';

export const creditNoteKeys = {
  all: ['credit-notes'] as const,
  page: (params: CreditNoteListFilters) => [...creditNoteKeys.all, 'page', params] as const,
  // Under ['credit-notes'] so any credit-note or invoice change (both
  // refresh that root via invalidateBusinessData) refreshes the picker too.
  invoicePicker: (search: string) => [...creditNoteKeys.all, 'invoice-picker', search] as const,
};

export function useCreditNotesPage(params: CreditNoteListFilters, seed?: { items: CreditNoteListRow[]; total: number }) {
  return useQuery({
    queryKey: creditNoteKeys.page(params),
    queryFn: () => listCreditNotesPage(params),
    placeholderData: (prev) => prev,
    ...(seed ? { initialData: seed } : {}),
  });
}

/** Sent / part-paid / paid invoices for the "pick an invoice" step of a
 * new credit note. */
export function useInvoicesForCreditNote(search: string) {
  return useQuery({
    queryKey: creditNoteKeys.invoicePicker(search),
    queryFn: () => searchInvoicesForCreditNote(search),
    placeholderData: (prev) => prev,
  });
}

// Mutations unwrap a returned `{ error }` into a thrown Error (so callers'
// try/catch + toast.error(e.message) show the real reason) and refresh
// every screen a credit note shows up on — the invoice's balance and
// status, stock, the customer's figures, reports.

export function useCreateCreditNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreditNoteInput) => unwrap(await createCreditNote(input)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useDeleteCreditNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteCreditNote(id)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

/** The customer's unpaid invoices a credit note's open credit can pay. */
export function useInvoicesForCredit(creditNoteId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...creditNoteKeys.all, 'credit-targets', creditNoteId],
    queryFn: () => listInvoicesForCredit(creditNoteId),
    enabled,
  });
}

export function useRecordRefund(creditNoteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amount: number; date: string; mode: string; reference?: string | null }) => unwrap(await recordRefund(creditNoteId, input)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useDeleteRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (refundId: string) => unwrap(await deleteRefund(refundId)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useApplyCredit(creditNoteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, amount }: { invoiceId: string; amount: number }) => unwrap(await applyCreditToInvoice(creditNoteId, invoiceId, amount)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}

export function useRemoveAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => unwrap(await removeCreditAdjustment(paymentId)),
    onSuccess: () => invalidateBusinessData(queryClient),
  });
}
