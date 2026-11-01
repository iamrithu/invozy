import { Skeleton } from '@/components/ui/skeleton';

// Mirrors customers-client.tsx's CURRENT layout: header, a toolbar row
// (search + state/sort selects), the status chips + "Show guests" row, then
// a table with a single ⋯ menu per row — so there's no layout shift once the
// real data (fetched server-side in page.tsx) replaces it.
export default function CustomersLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-1.5 h-3 w-48" />
        </div>
        <Skeleton className="h-9 w-36 rounded-sm2" />
      </div>

      <div className="mb-3 space-y-2.5">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 flex-1 sm:max-w-xs" />
          <Skeleton className="h-8 w-[160px]" />
          <Skeleton className="h-8 w-[160px]" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-8 w-20 rounded-sm2" />
          <Skeleton className="h-8 w-24 rounded-sm2" />
          <Skeleton className="h-8 w-14 rounded-sm2" />
          <Skeleton className="ml-auto h-5 w-28" />
        </div>
      </div>

      <div className="rounded-xl2 border border-line bg-surface shadow-card">
        <div className="flex items-center gap-4 border-b border-line px-4 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="hidden h-3 w-20 sm:block" />
          <Skeleton className="hidden h-3 w-16 md:block" />
          <Skeleton className="hidden h-3 w-16 lg:block" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Skeleton className="h-8 w-8 flex-shrink-0 rounded-sm2" />
              <div>
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="mt-1 h-2.5 w-20" />
              </div>
            </div>
            <Skeleton className="hidden h-3.5 w-24 flex-shrink-0 sm:block" />
            <Skeleton className="hidden h-3.5 w-20 flex-shrink-0 md:block" />
            <Skeleton className="hidden h-3.5 w-20 flex-shrink-0 lg:block" />
            <Skeleton className="h-8 w-8 flex-shrink-0 rounded-sm2" />
          </div>
        ))}
      </div>
    </div>
  );
}
