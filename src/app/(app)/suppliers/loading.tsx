import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';

// Mirrors suppliers-client.tsx: header with the Purchases/Suppliers switch
// and Add button, the search bar, then the table.
export default function SuppliersLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-1.5 h-3 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-44 rounded-sm2" />
          <Skeleton className="h-9 w-32 rounded-sm2" />
        </div>
      </div>
      <div className="mb-4 flex items-center gap-3 rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
        <Skeleton className="h-8 w-full max-w-[280px]" />
        <Skeleton className="ml-auto h-5 w-28" />
      </div>
      <SkeletonTable cols={5} />
    </div>
  );
}
