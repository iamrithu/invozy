import { Skeleton } from '@/components/ui/skeleton';

// Mirrors account-client.tsx's layout (profile header card + settings
// cards) so there's no layout shift once the real account data replaces it.
export default function AccountLoading() {
  return (
    <div>
      <div className="mb-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-1.5 h-3 w-72" />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4 rounded-xl2 border border-line bg-surface p-5 shadow-card">
          <Skeleton className="h-14 w-14 flex-shrink-0 rounded-sm2" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="space-y-2.5 rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
