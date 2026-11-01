import { Skeleton } from '@/components/ui/skeleton';

// Mirrors company-profile.tsx (title, logo header, jump list, section cards)
// so there's no layout shift once the real company data replaces it.
export default function CompanyLoading() {
  return (
    <div>
      <div className="mb-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-1.5 h-3 w-full max-w-96" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-col items-center gap-4 rounded-xl2 border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-start sm:gap-6 sm:p-6">
          <Skeleton className="h-32 w-32 flex-shrink-0 rounded-xl2 sm:h-40 sm:w-40" />
          <div className="w-full space-y-2.5">
            <Skeleton className="mx-auto h-6 w-56 sm:mx-0" />
            <Skeleton className="mx-auto h-3.5 w-72 max-w-full sm:mx-0" />
            <Skeleton className="mx-auto h-3.5 w-48 sm:mx-0" />
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[196px_minmax(0,1fr)] lg:items-start lg:gap-5">
          <div className="hidden space-y-1.5 lg:block">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-sm2" />
            ))}
          </div>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl2 border border-line bg-surface p-4 shadow-card sm:p-5">
                <Skeleton className="h-4 w-40" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
