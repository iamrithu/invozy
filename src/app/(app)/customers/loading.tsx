import { Skeleton, SkeletonList } from '@/components/ui/skeleton';

// Mirrors customers-client.tsx's layout (header, left list panel with
// search/filter chrome, right detail panel) so there's no layout shift once
// the real data (fetched server-side in page.tsx) replaces it.
export default function CustomersLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-1.5 h-3 w-72" />
        </div>
        <Skeleton className="h-9 w-36 rounded-sm2" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[330px_1fr]">
        <div className="max-h-[74vh] overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className="space-y-2 border-b border-line p-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
          <SkeletonList />
        </div>
        <div className="hidden rounded-xl2 border border-dashed border-line lg:block" />
      </div>
    </div>
  );
}
