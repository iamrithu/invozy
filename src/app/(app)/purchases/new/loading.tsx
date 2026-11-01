import { Skeleton } from '@/components/ui/skeleton';

// Mirrors purchase-form.tsx: back link, title, the bill-details card, the
// items card, then the totals card on the right.
export default function PurchaseFormLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-28" />
      <div>
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-1.5 h-3 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 rounded-xl2 border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <div className="rounded-xl2 border border-line bg-surface shadow-card">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
        <div className="p-4">
          <Skeleton className="h-9 w-full max-w-[440px]" />
        </div>
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-[170px] w-full rounded-xl2 lg:max-w-[360px]" />
      </div>
    </div>
  );
}
