import { Skeleton } from '@/components/ui/skeleton';

// Mirrors page.tsx's layout (greeting, stat cards, month-over-month +
// quick-actions row, top-customers strip, recent-invoices table) so there's
// no layout shift once the real data replaces it.
export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-1.5 h-3 w-72" />
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl2 border border-line bg-surface p-3 shadow-card">
            <Skeleton className="h-7 w-7 rounded-sm2" />
            <Skeleton className="mt-2 h-4 w-16" />
            <Skeleton className="mt-1.5 h-2.5 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[5fr_7fr]">
        <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-32 rounded-xl2" />
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="mb-2 h-3.5 w-56" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[128px] w-[168px] flex-shrink-0 rounded-lg2" />
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="mb-2 h-3.5 w-40" />
        <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line p-3 last:border-0">
              <Skeleton className="h-8 w-8 flex-shrink-0 rounded-sm2" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-36" />
              </div>
              <Skeleton className="h-3 w-14 flex-shrink-0" />
              <Skeleton className="h-3 w-16 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
