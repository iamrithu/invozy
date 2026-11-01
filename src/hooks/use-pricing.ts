import { useMutation, useQuery } from '@tanstack/react-query';
import {
  deleteCustomerPrice,
  deleteScheme,
  getCustomerPriceMap,
  listActiveSchemes,
  listCustomerPrices,
  listSchemes,
  saveScheme,
  setCustomerPrice,
  type SchemeInput,
} from '@/actions/pricing';
import { unwrap } from '@/lib/action-result';
import { useInvalidateBusinessData } from '@/hooks/use-invalidate';

// Keys live under ['customers'] and ['products'] so invalidateBusinessData
// refreshes them along with everything else after any mutation.
export const pricingKeys = {
  customerPrices: (customerId: string) => ['customers', 'prices', customerId] as const,
  customerPriceMap: (customerId: string) => ['customers', 'price-map', customerId] as const,
  schemes: (productId: string) => ['products', 'schemes', productId] as const,
  activeSchemes: () => ['products', 'active-schemes'] as const,
};

/** One customer's special prices with product names and catalog prices,
 * for the customer detail sheet. */
export function useCustomerPrices(customerId: string | null) {
  return useQuery({
    queryKey: pricingKeys.customerPrices(customerId ?? ''),
    queryFn: () => listCustomerPrices(customerId!),
    enabled: !!customerId,
  });
}

/** Flat { productId, unit, price } list for the invoice builder. */
export function useCustomerPriceMap(customerId: string | null) {
  return useQuery({
    queryKey: pricingKeys.customerPriceMap(customerId ?? ''),
    queryFn: () => getCustomerPriceMap(customerId!),
    enabled: !!customerId,
    staleTime: 30_000,
  });
}

export function useSetCustomerPrice() {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: async (input: { customerId: string; productId: string; unit: string; price: number }) => unwrap(await setCustomerPrice(input)),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCustomerPrice() {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteCustomerPrice(id)),
    onSuccess: () => invalidate(),
  });
}

/** One product's offers, for the product detail sheet. */
export function useSchemes(productId: string | null) {
  return useQuery({
    queryKey: pricingKeys.schemes(productId ?? ''),
    queryFn: () => listSchemes(productId!),
    enabled: !!productId,
  });
}

/** Offers valid right now, for the invoice builder's free-line suggestion. */
export function useActiveSchemes() {
  return useQuery({
    queryKey: pricingKeys.activeSchemes(),
    queryFn: () => listActiveSchemes(),
    staleTime: 60_000,
  });
}

export function useSaveScheme() {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: async (input: SchemeInput) => unwrap(await saveScheme(input)),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteScheme() {
  const invalidate = useInvalidateBusinessData();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteScheme(id)),
    onSuccess: () => invalidate(),
  });
}
