'use client';

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { listActivity, type ActivityEntityType } from '@/actions/activity';
import { unwrap } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { entityMeta, formatDateTimeIst, formatRelative } from './activity-meta';
import { useNow } from './use-now';

const LIMIT = 50;

/** One record's history ("who changed this invoice, and when") — newest
 * first, for a detail screen's History panel:
 *
 *   <ActivityTimeline entityType="invoice" entityId={invoice.id} />
 *
 * Works for staff as well as the owner (listActivity only requires a
 * signed-in user for a single record). An invoice's history includes the
 * payments logged against it, a product's includes its stock moves.
 * Cached under ['activity', entityType, entityId], so any mutation that
 * runs invalidateBusinessData() refreshes it. */
export function ActivityTimeline({
  entityType,
  entityId,
  className,
  emptyText = 'No changes recorded yet.',
}: {
  entityType: ActivityEntityType;
  entityId: string;
  className?: string;
  emptyText?: string;
}) {
  const now = useNow();
  const { data, isLoading, error } = useQuery({
    queryKey: ['activity', entityType, entityId],
    queryFn: async () => unwrap(await listActivity({ entityType, entityId, page: 1, pageSize: LIMIT })),
    enabled: !!entityId,
  });

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-6 w-6 flex-shrink-0" />
            <div className="flex-1 space-y-1.5 pt-0.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) return <p className={cn('text-[12px] font-semibold text-destructive', className)}>{error.message}</p>;

  const items = data?.items ?? [];
  if (!items.length) {
    return (
      <p className={cn('flex items-center gap-1.5 text-[12px] text-ink-faint', className)}>
        <History size={13} /> {emptyText}
      </p>
    );
  }

  return (
    <div className={className}>
      <ol>
        {items.map((row, i) => {
          const Icon = entityMeta(row.entityType).icon;
          const relative = formatRelative(row.createdAt, now);
          return (
            <li key={row.id} className="relative flex gap-3 pb-3.5 last:pb-0">
              {/* The thread joining one entry's icon to the next. */}
              {i < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-3 top-7 w-px bg-line" />}
              <span className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm2 bg-surface-alt text-ink-soft">
                <Icon size={12} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[12.5px] leading-snug text-ink-body">{row.summary}</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  <span className="font-semibold text-ink-soft">{row.userName}</span>
                  {' · '}
                  <time dateTime={row.createdAt} suppressHydrationWarning>
                    {relative ? `${relative} · ${formatDateTimeIst(row.createdAt)}` : formatDateTimeIst(row.createdAt)}
                  </time>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {data && data.total > items.length && (
        <p className="mt-3 text-[11px] text-ink-faint">
          Showing the latest {items.length} of {data.total} changes.
        </p>
      )}
    </div>
  );
}
