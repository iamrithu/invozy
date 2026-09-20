import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-sm2 bg-surface-alt', className)} {...props} />;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
      <Skeleton className="h-9 w-9 flex-shrink-0 rounded-sm2" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
      <Skeleton className="h-3 w-12 flex-shrink-0" />
    </div>
  );
}

function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

/** Table-shaped loading state — for the full-width Invoices/Customers/Products
 * tables, so a client-side refetch (e.g. typing a search query) shows the same
 * proportions as the real table instead of the old avatar-row-list shape. */
function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
      <div className="flex items-center gap-4 border-b border-line bg-surface-alt px-3.5 py-2.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
        <Skeleton className="h-2.5 w-16 flex-shrink-0" />
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-3.5 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" />
          ))}
          <div className="flex flex-shrink-0 gap-1.5">
            <Skeleton className="h-8 w-8 rounded-sm2" />
            <Skeleton className="h-8 w-8 rounded-sm2" />
            <Skeleton className="h-8 w-8 rounded-sm2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonRow, SkeletonList, SkeletonTable };
