import { Skeleton, SkeletonList } from '@/components/ui/skeleton';

// Mirrors activity-client.tsx (title, type chips, filter row, day-grouped
// list) so nothing jumps once the real log replaces it.
export default function ActivityLoading() {
  return (
    <div>
      <div className="mb-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-1.5 h-3 w-80 max-w-full" />
      </div>
      <div className="mb-2.5 flex gap-1.5 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 flex-shrink-0" />
        ))}
      </div>
      <div className="mb-3 flex gap-2">
        <Skeleton className="h-8 w-[170px]" />
        <Skeleton className="h-8 w-[130px]" />
      </div>
      <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
        <div className="border-b border-line bg-surface-alt px-4 py-2">
          <Skeleton className="h-2.5 w-16" />
        </div>
        <SkeletonList rows={6} />
      </div>
    </div>
  );
}
