import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCoupon, deleteCoupon, listAllSchemes, listCoupons, setCouponActive, setSchemeActive, updateCoupon, type CouponInput, type CouponRow, type SchemeListRow } from '@/actions/coupons';
import { unwrap } from '@/lib/action-result';

export const couponKeys = {
  all: ['coupons'] as const,
  list: (automatic: boolean) => [...couponKeys.all, 'list', automatic] as const,
  schemes: () => [...couponKeys.all, 'schemes'] as const,
};

export function useCoupons(automatic: boolean, seed?: CouponRow[]) {
  return useQuery({ queryKey: couponKeys.list(automatic), queryFn: () => listCoupons({ automatic }), initialData: seed, staleTime: 10_000 });
}

export function useSchemesList(seed?: SchemeListRow[]) {
  return useQuery({ queryKey: couponKeys.schemes(), queryFn: () => listAllSchemes(), initialData: seed, staleTime: 10_000 });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: couponKeys.all }), queryClient.invalidateQueries({ queryKey: ['order-quote'] })]);
}

/** Field errors ride along on the thrown error for the form to show. */
export function useSaveCoupon() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CouponInput }) => {
      const r = id ? await updateCoupon(id, input) : await createCoupon(input);
      if (r.error) throw Object.assign(new Error(r.error), { fieldErrors: r.fieldErrors });
      return r;
    },
    onSuccess: refresh,
  });
}

export function useSetCouponActive() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async ({ id, active }: { id: string; active: boolean }) => unwrap(await setCouponActive(id, active)), onSuccess: refresh });
}

export function useDeleteCoupon() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async (id: string) => unwrap(await deleteCoupon(id)), onSuccess: refresh });
}

export function useSetSchemeActive() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async ({ id, active }: { id: string; active: boolean }) => unwrap(await setSchemeActive(id, active)), onSuccess: refresh });
}
