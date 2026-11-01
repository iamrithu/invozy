import { Skeleton } from '@/components/ui/skeleton';

// Mirrors loading-sheet-client.tsx: back link, title, the controls bar, four
// day-total tiles and a couple of vehicle cards.
export default function LoadingSheetLoading() {
  return (
    <div>
      <Skeleton className="mb-3 h-3 w-16" />
      <Skeleton className="mb-1 h-6 w-40" />
      <Skeleton className="mb-4 h-3 w-52" />

      <div className="mb-4 rounded-xl2 border border-line bg-surface p-3 shadow-card">
        <Skeleton className="h-8 w-full max-w-[520px]" />
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg2 border border-line bg-surface p-2.5 shadow-card">
            <Skeleton className="h-6 w-6 rounded-sm2" />
            <Skeleton className="mt-2 h-4 w-20" />
            <Skeleton className="mt-1.5 h-2.5 w-24" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl2 border border-line bg-surface shadow-card">
            <div className="border-b border-line px-3.5 py-3">
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="grid grid-cols-1 gap-4 p-3.5 lg:grid-cols-[5fr_7fr]">
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-3 w-full" />
                ))}
              </div>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-full" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
