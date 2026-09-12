'use client';

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
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className={cn('flex flex-shrink-0 items-center justify-between gap-3 border-t border-line px-3.5 py-2.5', className)}>
      <span className="text-[11.5px] font-semibold text-ink-faint">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-sm2" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft size={14} />
        </Button>
        <span className="font-mono text-[11.5px] font-bold text-ink">
          {page}/{totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-sm2"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
