import { Skeleton } from '@/components/ui/skeleton';

// Mirrors company-view.tsx's card grid (profile header, registration, GST
// rates, banking, invoice numbering) so there's no layout shift once the
// real company data replaces it.
export default function CompanyLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-1.5 h-3 w-96" />
        </div>
        <Skeleton className="h-9 w-32 rounded-sm2" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex items-center gap-4 rounded-xl2 border border-line bg-surface p-5 shadow-card lg:col-span-12">
          <Skeleton className="h-16 w-16 flex-shrink-0 rounded-xl2" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="space-y-2.5 rounded-xl2 border border-line bg-surface p-4 shadow-card lg:col-span-7">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <div className="space-y-2.5 rounded-xl2 border border-line bg-surface p-4 shadow-card lg:col-span-5">
          <Skeleton className="h-3 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-12 flex-1 rounded-lg2" />
            <Skeleton className="h-12 flex-1 rounded-lg2" />
            <Skeleton className="h-12 flex-1 rounded-lg2" />
          </div>
        </div>
        <div className="space-y-2.5 rounded-xl2 border border-line bg-surface p-4 shadow-card lg:col-span-7">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <div className="space-y-2.5 rounded-xl2 border border-line bg-surface p-4 shadow-card lg:col-span-5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
    </div>
  );
}
