import { useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

/** Every cached list that can show an invoice, customer, product or stock
 * figure. A change to any of those can surface on any of these screens (an
 * invoice delete changes the customer's balance, reports, search results
 * and stock), so mutations refresh them all together instead of each hook
 * guessing which neighbours it affects. */
const BUSINESS_KEYS = [['invoices'], ['customers'], ['products'], ['reports'], ['global-search'], ['inventory'], ['credit-notes'], ['purchases'], ['suppliers'], ['activity'], ['notifications'], ['categories']];

export function invalidateBusinessData(queryClient: QueryClient) {
  return Promise.all(BUSINESS_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useInvalidateBusinessData() {
  const queryClient = useQueryClient();
  return useCallback(() => invalidateBusinessData(queryClient), [queryClient]);
}
