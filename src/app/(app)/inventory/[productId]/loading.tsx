import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';

// Mirrors ledger-client.tsx: back link, name + meta line with the big stock
// figure on the right, six summary cards, the cost/forecast strip, the
// filter toolbar, then the ledger table.
export default function StockLedgerLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-28" />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <Skeleton className="h-6 w-72 max-w-full" />
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </div>
        <div className="space-y-2 md:items-end">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-28 md:ml-auto" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[58px] rounded-lg2" />
        ))}
      </div>
      <Skeleton className="h-[72px] rounded-xl2" />
      <div className="flex flex-wrap gap-2">
        {[44, 76, 60, 72, 96].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-sm2" style={{ width: w }} />
        ))}
        <Skeleton className="ml-auto h-8 w-64" />
      </div>
      <SkeletonTable cols={7} />
    </div>
  );
}
