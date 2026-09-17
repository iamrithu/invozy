import { Skeleton, SkeletonList } from '@/components/ui/skeleton';

// Mirrors invoices-client.tsx's layout (header, left list panel with
// search/filter chrome, right detail panel) so there's no layout shift once
// the real data (fetched server-side in page.tsx) replaces it.
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[350px_1fr]">
        <div className="max-h-[74vh] overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className="space-y-2 border-b border-line p-3">
            <Skeleton className="h-9 w-full" />
            <div className="flex gap-1">
              <Skeleton className="h-7 w-14 rounded-sm2" />
              <Skeleton className="h-7 w-16 rounded-sm2" />
              <Skeleton className="h-7 w-16 rounded-sm2" />
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
          <SkeletonList />
        </div>
        <div className="hidden rounded-xl2 border border-dashed border-line lg:block" />
      </div>
    </div>
  );
}
