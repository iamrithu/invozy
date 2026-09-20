import { Skeleton } from '@/components/ui/skeleton';

// Mirrors invoices-client.tsx's CURRENT layout: header, a toolbar row
// (search + status filter pills + sort select), then a full-width table
// with icon-sized action skeletons on the right — so there's no layout
// shift once the real data (fetched server-side in page.tsx) replaces it.
export default function InvoicesLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-28" />
          <Skeleton className="mt-1.5 h-3 w-80" />
        </div>
        <Skeleton className="h-9 w-32 rounded-sm2" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl2 border border-line bg-surface p-3 shadow-card">
        <Skeleton className="h-8 w-full max-w-xs flex-shrink-0" />
        <div className="flex flex-1 gap-1.5">
          <Skeleton className="h-8 w-12 flex-shrink-0 rounded-sm2" />
          <Skeleton className="h-8 w-14 flex-shrink-0 rounded-sm2" />
          <Skeleton className="h-8 w-14 flex-shrink-0 rounded-sm2" />
          <Skeleton className="h-8 w-14 flex-shrink-0 rounded-sm2" />
          <Skeleton className="h-8 w-14 flex-shrink-0 rounded-sm2" />
        </div>
        <Skeleton className="h-8 w-[180px] flex-shrink-0" />
      </div>

      <div className="rounded-xl2 border border-line bg-surface shadow-card">
        <div className="flex items-center gap-4 border-b border-line px-4 py-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="ml-auto h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0">
            <Skeleton className="h-3.5 w-20 flex-shrink-0" />
            <Skeleton className="h-3.5 w-28 flex-shrink-0" />
            <Skeleton className="h-3.5 w-16 flex-shrink-0" />
            <Skeleton className="h-3.5 w-16 flex-shrink-0" />
            <Skeleton className="h-5 w-16 flex-shrink-0 rounded-sm2" />
            <Skeleton className="ml-auto h-3.5 w-16 flex-shrink-0" />
            <div className="flex flex-shrink-0 gap-1.5">
              <Skeleton className="h-8 w-8 rounded-sm2" />
              <Skeleton className="h-8 w-8 rounded-sm2" />
              <Skeleton className="h-8 w-8 rounded-sm2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
