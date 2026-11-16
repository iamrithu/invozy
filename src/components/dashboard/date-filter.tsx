'use client';

import { useRouter } from 'next/navigation';
import { PeriodPicker, periodToParams } from '@/components/filters/period-picker';
import type { DashboardRange } from '@/lib/dashboard-period';

/** The dashboard's date filter — the shared PeriodPicker, with each choice
 * moving the URL (`?period=` and, for custom dates, `&from=&to=`) so the
 * server page re-renders for those dates and every view can be bookmarked.
 * Mount it with a `key` of the current range. */
export function DashboardDateFilter({ range, today }: { range: Pick<DashboardRange, 'preset' | 'from' | 'to' | 'previousLabel'>; today: string }) {
  const router = useRouter();
  return (
    <PeriodPicker
      value={{ preset: range.preset, from: range.from, to: range.to }}
      today={today}
      compareLabel={range.previousLabel}
      align="end"
      onChange={(v) => {
        // Keep the other params (the Include drafts switch) as they are.
        const qs = periodToParams(v, new URLSearchParams(window.location.search), 'month').toString();
        router.push(qs ? `/dashboard?${qs}` : '/dashboard', { scroll: false });
      }}
    />
  );
}
