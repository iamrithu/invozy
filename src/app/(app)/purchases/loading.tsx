import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';

// Mirrors purchases-client.tsx: header with the Purchases/Suppliers switch,
// three month-summary tiles, the filter bar, then the bills table.
export default function PurchasesLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-1.5 h-3 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-44 rounded-sm2" />
          <Skeleton className="h-9 w-36 rounded-sm2" />
        </div>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[58px] rounded-xl2" />
        ))}
      </div>
      <div className="mb-4 flex gap-2.5 rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
        <Skeleton className="h-8 w-full max-w-[280px]" />
        <Skeleton className="h-8 w-[200px]" />
      </div>
      <SkeletonTable cols={6} />
    </div>
  );
}
