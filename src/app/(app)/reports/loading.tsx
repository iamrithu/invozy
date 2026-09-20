import { Skeleton } from '@/components/ui/skeleton';

// Next.js wraps this in a Suspense boundary at the route level automatically
// — no client-side Suspense/query changes needed. Mirrors page.tsx's layout
// (5 stat cards, a two-column chart row, a top-customers table) so there's
// no layout shift once the real data replaces it.
export default function ReportsLoading() {
  return (
    <div>
      <Skeleton className="mb-1 h-6 w-32" />
      <Skeleton className="mb-4 h-3 w-64" />

      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl2 border border-line bg-surface p-3 shadow-card">
            <Skeleton className="h-7 w-7 rounded-sm2" />
            <Skeleton className="mt-2 h-4 w-16" />
            <Skeleton className="mt-1.5 h-2.5 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[7fr_5fr]">
        <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
          <Skeleton className="mb-3 h-3.5 w-40" />
          <Skeleton className="h-[180px] w-full" />
        </div>
        <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
          <Skeleton className="mb-3 h-3.5 w-32" />
          <div className="flex items-center gap-5">
            {/* Mimics the real donut chart's actual round shape, unlike every other boxy skeleton on this page. */}
            <Skeleton className="h-[120px] w-[120px] flex-shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Skeleton className="mb-2 h-3.5 w-48" />
        <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-line p-3 last:border-0">
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
