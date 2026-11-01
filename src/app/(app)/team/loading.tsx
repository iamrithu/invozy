import { Skeleton, SkeletonList } from '@/components/ui/skeleton';

// Mirrors team-client.tsx (logins list + "what staff can do" card) so
// nothing shifts once the real list replaces it.
export default function TeamLoading() {
  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-28" />
          <Skeleton className="mt-1.5 h-3 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card lg:col-span-8">
          <div className="border-b border-line px-4 py-3">
            <Skeleton className="h-3 w-20" />
          </div>
          <SkeletonList rows={3} />
        </div>
        <div className="space-y-2.5 rounded-xl2 border border-line bg-surface p-4 shadow-card lg:col-span-4">
          <Skeleton className="h-4 w-36" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-4/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
