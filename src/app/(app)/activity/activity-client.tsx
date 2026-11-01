'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, History } from 'lucide-react';
import { listActivity, type ActivityEntityType, type ActivityPage, type ActivityRow } from '@/actions/activity';
import type { TeamMember } from '@/actions/team';
import { unwrap } from '@/lib/action-result';
import { resolveDateRange, type DateFilterMode } from '@/lib/dates';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangeFilter } from '@/components/filters/date-range-filter';
import { userLabel } from '@/components/current-user';
import { activityHref, dayHeading, entityMeta, formatDateTimeIst, formatRelative, formatTimeIst, groupByIstDay } from '@/components/activity/activity-meta';
import { useNow } from '@/components/activity/use-now';

/** Type chips — related records share one chip (an invoice's payments,
 * a product's stock moves) so the row of chips stays short. */
const GROUPS: { key: string; label: string; types?: ActivityEntityType[] }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'invoices', label: 'Invoices & payments', types: ['invoice', 'payment'] },
  { key: 'customers', label: 'Customers', types: ['customer'] },
  { key: 'stock', label: 'Products & stock', types: ['product', 'stock'] },
  { key: 'purchases', label: 'Purchases', types: ['purchase', 'supplier'] },
  { key: 'credit-notes', label: 'Credit notes', types: ['credit-note'] },
  { key: 'settings', label: 'Settings & logins', types: ['company', 'user'] },
];

export function ActivityClient({ initialData, people, pageSize }: { initialData: ActivityPage; people: TeamMember[]; pageSize: number }) {
  const [group, setGroup] = useState('all');
  const [userId, setUserId] = useState('all');
  const [dateMode, setDateMode] = useState<DateFilterMode>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(1);
  const now = useNow();

  useEffect(() => setPage(1), [group, userId, dateMode, customFrom, customTo]);

  const { from, to } = resolveDateRange(dateMode, customFrom, customTo);
  const params = {
    entityType: GROUPS.find((g) => g.key === group)?.types,
    userId: userId === 'all' ? undefined : userId,
    dateFrom: from,
    dateTo: to,
    page,
    pageSize,
  };
  const isDefault = group === 'all' && userId === 'all' && dateMode === 'all' && page === 1;
  const filtered = group !== 'all' || userId !== 'all' || dateMode !== 'all';

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['activity', 'log', params],
    queryFn: async () => unwrap(await listActivity(params)),
    placeholderData: (prev) => prev,
    ...(isDefault && !initialData.error ? { initialData } : {}),
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const groups = useMemo(() => groupByIstDay(items), [items]);

  function clearFilters() {
    setGroup('all');
    setUserId('all');
    setDateMode('all');
    setCustomFrom('');
    setCustomTo('');
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
          <History size={18} className="text-brand" /> Activity log
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">Who did what, and when — every invoice, payment, stock and login change, newest first.</p>
      </div>

      {/* Scrolls sideways on a phone instead of wrapping into three rows. */}
      <div className="-mx-4 mb-2.5 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroup(g.key)}
            aria-pressed={group === g.key}
            className={clsx(
              'flex-shrink-0 whitespace-nowrap rounded-sm2 border px-3 py-1.5 text-[12px] font-bold transition-colors',
              group === g.key ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft hover:border-brand/50 hover:text-ink'
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="h-8 w-[170px] text-[11.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {userLabel(p)}
                {!p.active && ' (disabled)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter mode={dateMode} onModeChange={setDateMode} from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />
        {filtered && (
          <button type="button" onClick={clearFilters} className="text-[12px] font-bold text-brand hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <div className={clsx('overflow-hidden rounded-xl2 border border-line bg-surface shadow-card transition-opacity', isFetching && !isLoading && 'opacity-60')}>
        {isLoading ? (
          <SkeletonList rows={6} />
        ) : error ? (
          <div className="p-10 text-center text-[13px] font-semibold text-destructive">{error.message}</div>
        ) : total === 0 ? (
          <div className="p-10 text-center">
            <History size={22} className="mx-auto text-ink-faint" />
            <p className="mt-2 text-[13px] font-bold text-ink">{filtered ? 'Nothing matches these filters' : 'Nothing logged yet'}</p>
            <p className="mt-1 text-[12px] text-ink-faint">
              {filtered ? 'Try a wider date range or another person.' : 'Changes to invoices, payments, stock, customers and logins will show up here as they happen.'}
            </p>
          </div>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.dayKey} className="border-t border-line first:border-t-0">
                <h2 className="border-b border-line bg-surface-alt px-4 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint" suppressHydrationWarning>
                  {dayHeading(g.dayKey, now)}
                </h2>
                <ul>
                  {g.rows.map((row) => (
                    <ActivityListRow key={row.id} row={row} now={now} />
                  ))}
                </ul>
              </section>
            ))}
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

function ActivityListRow({ row, now }: { row: ActivityRow; now: number }) {
  const meta = entityMeta(row.entityType);
  const Icon = meta.icon;
  const href = activityHref(row);
  const relative = formatRelative(row.createdAt, now);

  const body = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-ink">{row.summary}</p>
        <p className="mt-0.5 text-[11.5px] text-ink-faint">
          <span className="font-semibold text-ink-soft">{row.userName}</span>
          {' · '}
          {meta.label}
          {' · '}
          <time dateTime={row.createdAt} title={formatDateTimeIst(row.createdAt)} suppressHydrationWarning>
            {formatTimeIst(row.createdAt)}
            {relative && ` (${relative})`}
          </time>
        </p>
      </div>
      {href && <ChevronRight size={15} className="mt-2 flex-shrink-0 text-ink-faint" />}
    </div>
  );

  return (
    <li className="border-b border-line last:border-0">
      {href ? (
        <Link href={href} className="block transition-colors hover:bg-surface-alt">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}
