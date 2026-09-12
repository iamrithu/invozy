import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-sm2 bg-surface-alt', className)} {...props} />;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
      <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
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

export { Skeleton, SkeletonRow, SkeletonList };
