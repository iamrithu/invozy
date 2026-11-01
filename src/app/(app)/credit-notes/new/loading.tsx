import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the credit-note form (credit-note-form.tsx): title, then the
// lines card beside the details/totals panel.
export default function NewCreditNoteLoading() {
  return (
    <div>
      <Skeleton className="mb-3 h-3.5 w-24" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mb-4 mt-1.5 h-3 w-72" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="rounded-xl2 border border-line bg-surface shadow-card">
          <div className="border-b border-line px-3.5 py-3">
            <Skeleton className="h-3.5 w-36" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line px-3.5 py-3.5 last:border-0">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
