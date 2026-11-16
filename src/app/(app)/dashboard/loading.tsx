import { Skeleton } from '@/components/ui/skeleton';

// Mirrors page.tsx's layout (header + period switch + actions, four KPI
// tiles, the chart beside receivables by age, top customers / top products,
// then due this week · recent invoices · stock) so there's little layout shift once the real data lands.
export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-1.5 h-3 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-sm2" />
          <Skeleton className="h-9 w-24 rounded-sm2" />
          <Skeleton className="h-9 w-32 rounded-sm2" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
            <Skeleton className="mt-2.5 h-6 w-32" />
            <Skeleton className="mt-2 h-3 w-40" />
            <Skeleton className="mt-3 h-8 w-full" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CardSkeleton>
          <Skeleton className="h-[200px] w-full" />
        </CardSkeleton>
        <CardSkeleton>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </CardSkeleton>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, c) => (
          <CardSkeleton key={c}>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-3" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </CardSkeleton>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <CardSkeleton>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-14 rounded-sm2" />
              </div>
            ))}
          </div>
        </CardSkeleton>
        <CardSkeleton>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-5 w-16 rounded-sm2" />
                <Skeleton className="ml-auto h-3 w-20" />
              </div>
            ))}
          </div>
        </CardSkeleton>
        <CardSkeleton>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg2" />
            ))}
          </div>
        </CardSkeleton>
      </div>
    </div>
  );
}

function CardSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
      <Skeleton className="mb-4 h-3.5 w-36" />
      {children}
    </div>
  );
}
