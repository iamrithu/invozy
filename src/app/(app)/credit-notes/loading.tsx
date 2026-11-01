import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';

// Mirrors credit-notes-client.tsx: header, a toolbar (search + date range),
// then the table — so nothing shifts when the real rows arrive.
export default function CreditNotesLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-1.5 h-3 w-80" />
        </div>
        <Skeleton className="h-9 w-40 rounded-sm2" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl2 border border-line bg-surface p-3 shadow-card">
        <Skeleton className="h-8 w-full max-w-xs" />
        <Skeleton className="h-8 w-[130px]" />
      </div>
      <SkeletonTable cols={7} />
    </div>
  );
}
