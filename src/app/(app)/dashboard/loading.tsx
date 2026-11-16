import { Skeleton } from '@/components/ui/skeleton';

// Mirrors page.tsx's layout so there's little layout shift once the real
// data lands: the header, Business totals (four groups of three figures),
// the Date-wise summary (date filter, the same four groups, two rows of
// charts, top customers / products / routes), and Day to day (due this week ·
// recent invoices · stock).
export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-1.5 h-3 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-sm2" />
          <Skeleton className="h-9 w-32 rounded-sm2" />
          <Skeleton className="h-9 w-24 rounded-sm2" />
        </div>
      </div>

      <SectionSkeleton>
        <GroupsSkeleton />
      </SectionSkeleton>

      <SectionSkeleton>
        <div className="rounded-xl2 border border-line bg-surface shadow-card">
          <div className="p-2">
            <Skeleton className="h-10 w-full rounded-lg2" />
          </div>
          <div className="flex justify-between gap-4 border-t border-line px-3.5 py-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <GroupsSkeleton />
        {Array.from({ length: 2 }).map((_, r) => (
          <div key={r} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <CardSkeleton>
              <Skeleton className="h-[200px] w-full" />
            </CardSkeleton>
            <CardSkeleton>
              <Skeleton className="h-7 w-full rounded-[4px]" />
              <div className="mt-3 flex flex-wrap gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-20" />
                ))}
              </div>
            </CardSkeleton>
          </div>
        ))}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, c) => (
            <CardSkeleton key={c}>
              <RowsSkeleton />
            </CardSkeleton>
          ))}
        </div>
      </SectionSkeleton>

      <SectionSkeleton>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, c) => (
            <CardSkeleton key={c}>
              <RowsSkeleton />
            </CardSkeleton>
          ))}
        </div>
      </SectionSkeleton>
    </div>
  );
}

function SectionSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="border-b border-line pb-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-1.5 h-3 w-80 max-w-full" />
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function GroupsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <Skeleton className="h-3.5 w-40" />
          <div className="mt-3 grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-5 w-16" />
                <Skeleton className="mt-1.5 h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
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
