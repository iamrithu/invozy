import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';

// Mirrors inventory-client.tsx: header with two buttons, the filter card
// (status chips, then search + category), then the stock table.
export default function InventoryLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-1.5 h-3 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-sm2" />
          <Skeleton className="h-9 w-28 rounded-sm2" />
        </div>
      </div>

      <div className="mb-4 space-y-2.5 rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
        <div className="flex gap-1.5 overflow-hidden">
          {[44, 80, 56, 100, 92, 72, 76].map((w, i) => (
            <Skeleton key={i} className="h-8 flex-shrink-0 rounded-sm2" style={{ width: w }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Skeleton className="h-8 w-full max-w-[260px]" />
          <Skeleton className="h-8 w-[170px]" />
        </div>
      </div>

      <SkeletonTable cols={6} />
    </div>
  );
}
