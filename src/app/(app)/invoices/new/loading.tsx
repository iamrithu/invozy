import { Skeleton } from '@/components/ui/skeleton';

// Mirrors builder-client.tsx's layout (back/date row, progress stepper, the
// Bill-to + Add-products cards on the left, the invoice sheet on the right)
// so there's no layout shift once the product catalog (fetched server-side
// in page.tsx) replaces it.
export default function NewInvoiceLoading() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-14 rounded-sm2" />
        <Skeleton className="ml-auto h-9 w-40 rounded-sm2" />
        <Skeleton className="h-9 w-32 rounded-sm2" />
      </div>

      <Skeleton className="mb-4 h-6 w-full max-w-[520px]" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="flex flex-col gap-3.5">
          <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
            <Skeleton className="mb-2.5 h-3 w-20" />
            <Skeleton className="h-9 w-full rounded-sm2" />
          </div>
          <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
            <Skeleton className="mb-2.5 h-3 w-24" />
            <Skeleton className="h-9 w-full rounded-sm2" />
          </div>
        </div>
        <Skeleton className="h-[70vh] w-full rounded-xl2" />
      </div>
    </div>
  );
}
