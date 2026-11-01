import { Skeleton } from '@/components/ui/skeleton';

// Mirrors credit-notes/[id]/page.tsx: back link, title + actions, four
// stat cards, then the paper preview.
export default function CreditNoteLoading() {
  return (
    <div>
      <Skeleton className="mb-3 h-3.5 w-24" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-1.5 h-3 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32 rounded-sm2" />
          <Skeleton className="h-8 w-20 rounded-sm2" />
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[62px] rounded-lg2" />
        ))}
      </div>
      <div className="rounded-xl2 border border-line bg-surface-alt p-3 shadow-card md:p-5">
        <Skeleton className="mx-auto h-[560px] w-full max-w-[760px] rounded-none bg-surface" />
      </div>
    </div>
  );
}
