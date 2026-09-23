'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DateFilterMode } from '@/lib/dates';

const MODE_OPTIONS: { value: DateFilterMode; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

/** Shared date-range control — Today/This week/This month/This year/All
 * time/Custom, the last one revealing two native date inputs. Used by both
 * the Invoices list and the Reports page (see src/lib/dates.ts's
 * resolveDateRange, which turns `mode` + the custom bounds into the actual
 * IST calendar-date range each screen queries with) so the two screens
 * offer identical date vocabulary instead of two subtly different pickers. */
export function DateRangeFilter({
  mode,
  onModeChange,
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: {
  mode: DateFilterMode;
  onModeChange: (mode: DateFilterMode) => void;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-shrink-0 items-center gap-1.5 ${className ?? ''}`}>
      <Select value={mode} onValueChange={(v) => onModeChange(v as DateFilterMode)}>
        <SelectTrigger className="h-8 w-[130px] flex-shrink-0 text-[11.5px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mode === 'custom' && (
        <div className="flex items-center gap-1 rounded-sm2 border border-line bg-bg px-2 py-1">
          <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="border-none bg-transparent font-mono text-[11px] text-ink-body outline-none" />
          <span className="text-ink-faint">–</span>
          <input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="border-none bg-transparent font-mono text-[11px] text-ink-body outline-none" />
        </div>
      )}
    </div>
  );
}
