'use client';

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Deleting the last row on the last page leaves `page` pointing past the
  // end ("Showing 11–10 of 10" over an empty table) — pull it back to the
  // last page that has rows. Skipped while total is 0, which is also what a
  // list looks like mid-load, so a page change can't be undone by a fetch.
  useEffect(() => {
    if (total > 0 && page > totalPages) onPageChange(totalPages);
  }, [total, page, totalPages, onPageChange]);

  if (total === 0) return null;
  const shownPage = Math.min(page, totalPages);
  const start = (shownPage - 1) * pageSize + 1;
  const end = Math.min(shownPage * pageSize, total);

  return (
    <div className={cn('flex flex-shrink-0 items-center justify-between gap-3 border-t border-line px-3.5 py-2.5', className)}>
      <span className="text-[11.5px] font-semibold text-ink-faint">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-sm2"
          disabled={shownPage <= 1}
          onClick={() => onPageChange(shownPage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </Button>
        <span className="font-mono text-[11.5px] font-bold text-ink">
          {shownPage}/{totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-sm2"
          disabled={shownPage >= totalPages}
          onClick={() => onPageChange(shownPage + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
