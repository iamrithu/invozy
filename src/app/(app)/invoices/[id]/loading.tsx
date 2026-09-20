import { Skeleton } from '@/components/ui/skeleton';

// Mirrors page.tsx's layout (back link + status + action buttons, the
// embedded PDF preview) so there's no layout shift once the real invoice
// data replaces it.
export default function InvoiceDetailLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-4 w-32" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-16 rounded-sm2" />
          <Skeleton className="h-8 w-28 rounded-sm2" />
          <Skeleton className="h-8 w-28 rounded-sm2" />
          <Skeleton className="h-8 w-28 rounded-sm2" />
        </div>
      </div>

      <div className="mx-auto max-w-[900px]">
        <Skeleton className="h-[85vh] w-full rounded-xl2" />
      </div>
    </div>
  );
}
