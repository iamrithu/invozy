'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { BarChart3, Boxes, CalendarRange, HandCoins, LayoutDashboard, TrendingUp, Truck, Wallet, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangeFilter } from '@/components/filters/date-range-filter';
import { ExportMenu } from '@/components/reports/export-menu';
import { rangeLabel } from '@/components/reports/format';
import { useCustomersForFilter } from '@/hooks/use-customers';
import { customerDisplayName } from '@/lib/customer';
import { resolveDateRange, type DateFilterMode } from '@/lib/dates';
import type { ReportFilters } from '@/actions/reports';
import { REPORT_TABS, parseReportTab, type ReportTab } from './report-tabs';
import { OverviewTab, type OverviewSeed } from './overview-tab';
import { SalesTab } from './sales-tab';
import { ReceivablesTab } from './receivables-tab';
import { CollectionsTab } from './collections-tab';
import { InventoryTab } from './inventory-tab';

const TAB_ICON: Record<ReportTab, LucideIcon> = {
  overview: LayoutDashboard,
  sales: TrendingUp,
  receivables: Wallet,
  collections: HandCoins,
  inventory: Boxes,
};

type StatusFilter = 'all' | 'SENT' | 'PARTIALLY_PAID' | 'PAID';

/** The Reports page: one filter bar (date range + customer) over five
 * tabs — Overview, Sales analysis, Receivables, Collections, Inventory —
 * every tab reading the same filters, so switching tabs never changes the
 * slice being looked at. The tab lives in the URL (`?tab=`), so a link can
 * open straight onto Receivables; switching tabs replaces the URL rather
 * than stacking history, and only the open tab's queries run. The status
 * filter narrows invoices by payment status, which only the Overview's
 * figures are about, so it shows on that tab alone. */
export function ReportsClient({ seed, currency }: { seed?: OverviewSeed; currency?: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tab = parseReportTab(searchParams.get('tab'));

  const [dateMode, setDateMode] = useState<DateFilterMode>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from: dateFrom, to: dateTo } = resolveDateRange(dateMode, customFrom, customTo);
  const [customerId, setCustomerId] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const { data: customerOptions } = useCustomersForFilter();

  const filters: ReportFilters = { dateFrom, dateTo, customerId: customerId === 'all' ? undefined : customerId };
  const overviewFilters: ReportFilters = { ...filters, status };
  const isDefault = dateMode === 'all' && customerId === 'all' && status === 'all';

  // Native history calls sync with useSearchParams in the App Router (see
  // the Next docs' linking-and-navigating guide), so this re-renders onto
  // the new tab without a server round trip.
  function selectTab(next: string) {
    const t = parseReportTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (t === 'overview') params.delete('tab');
    else params.set('tab', t);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-extrabold text-ink sm:text-[20px]">
            <BarChart3 size={18} className="text-brand" /> Reports
          </h1>
          <p className="mt-1 text-[12.5px] text-ink-faint">Sent and paid invoices only — drafts aren&apos;t counted until they go out.</p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/reports/loading-sheet">
              <Truck size={13} /> Loading sheet
            </Link>
          </Button>
          <ExportMenu range={{ from: dateFrom, to: dateTo }} rangeLabel={rangeLabel(dateFrom, dateTo)} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl2 border border-line bg-surface p-3 shadow-card print:hidden">
        <DateRangeFilter mode={dateMode} onModeChange={setDateMode} from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} className="max-w-full flex-wrap" />
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="h-8 w-[190px] max-w-full flex-shrink-0 text-[11.5px]">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customerOptions?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {customerDisplayName(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tab === 'overview' && (
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-[150px] flex-shrink-0 text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="PARTIALLY_PAID">Partially paid</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
            </SelectContent>
          </Select>
        )}
        {dateMode !== 'all' && (dateFrom || dateTo) && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-faint sm:ml-auto">
            <CalendarRange size={11} /> {rangeLabel(dateFrom, dateTo)}
          </span>
        )}
      </div>

      <Tabs value={tab} onValueChange={selectTab}>
        <div className="-mx-4 mb-1 overflow-x-auto px-4 print:hidden sm:mx-0 sm:px-0">
          <TabsList className="w-max">
            {REPORT_TABS.map((t) => {
              const Icon = TAB_ICON[t.id];
              return (
                <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
                  <Icon size={13} /> {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab filters={overviewFilters} isDefault={isDefault} seed={seed} currency={currency} onOpenSales={() => selectTab('sales')} />
        </TabsContent>
        <TabsContent value="sales">
          <SalesTab filters={filters} currency={currency} />
        </TabsContent>
        <TabsContent value="receivables">
          <ReceivablesTab filters={filters} currency={currency} />
        </TabsContent>
        <TabsContent value="collections">
          <CollectionsTab filters={filters} currency={currency} />
        </TabsContent>
        <TabsContent value="inventory">
          <InventoryTab filters={filters} currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
