'use client';

import { SegmentedBar, type BarSegment } from '@/components/charts/segmented-bar';
import { ColumnChart } from '@/components/charts/column-chart';
import { fmtMoneyWhole } from '@/components/reports/format';
import { fmtInr } from '@/lib/gst';
import type { PaymentModeShare } from '@/actions/dashboard';
import type { WeekdayPoint } from '@/actions/reports';

// Client wrappers for the dashboard's smaller charts — the chart components
// take formatting functions, which a server page can't hand to a client
// component, so the formatting lives here.

// Categorical slots 1–4 of the dataviz reference palette (blue, orange,
// aqua, yellow), validated with its script against this app's own card
// surfaces: light #ffffff and dark hsl(0 0% 12%) — all checks pass; aqua and
// yellow sit under 3:1 on white, which the legend's visible names and
// amounts relieve. Text on a block is white or near-black, whichever reads
// on that fill in that theme. Anything past four modes folds into Other.
const MODE_FILLS: Pick<BarSegment, 'fill' | 'ink'>[] = [
  { fill: 'bg-[#2a78d6] dark:bg-[#3987e5]', ink: 'text-white dark:text-[#1c1c1c]' },
  { fill: 'bg-[#eb6834] dark:bg-[#d95926]', ink: 'text-[#1c1c1c]' },
  { fill: 'bg-[#1baf7a] dark:bg-[#199e70]', ink: 'text-[#1c1c1c]' },
  { fill: 'bg-[#eda100] dark:bg-[#c98500]', ink: 'text-[#1c1c1c]' },
];
const OTHER_FILL: Pick<BarSegment, 'fill' | 'ink'> = { fill: 'bg-[hsl(0_0%_78%)] dark:bg-[hsl(0_0%_40%)]', ink: 'text-[#1c1c1c] dark:text-white' };

/** How the period's cash came in — one bar split by payment mode, largest
 * first, each mode named with its amount in the legend. */
export function PaymentModesBar({ modes, currency }: { modes: PaymentModeShare[]; currency: string }) {
  const top = modes.slice(0, 4);
  const rest = modes.slice(4);
  const segments: BarSegment[] = top.map((m, i) => ({ key: m.mode, label: `${m.mode} · ${m.count}`, value: m.amount, ...MODE_FILLS[i] }));
  if (rest.length) segments.push({ key: 'other', label: `Other · ${rest.reduce((s, m) => s + m.count, 0)}`, value: rest.reduce((s, m) => s + m.amount, 0), ...OTHER_FILL });
  return <SegmentedBar segments={segments} format={(n) => fmtInr(n, currency)} label="Cash received by payment mode" />;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A typical day of each weekday in the period — average sales per Monday,
 * Tuesday… (taxable value), so a month with five Mondays doesn't flatter
 * Monday. The best day is labelled on its column. */
export function WeekdayChart({ points, currency }: { points: WeekdayPoint[]; currency: string }) {
  return (
    <ColumnChart
      data={points.map((p) => ({
        key: String(p.dow),
        label: p.label,
        value: p.average,
        detail: `${p.invoices} invoice${p.invoices === 1 ? '' : 's'} over ${p.days} ${DAY_NAMES[p.dow - 1]}${p.days === 1 ? '' : 's'}`,
      }))}
      format={(n) => fmtInr(n, currency)}
      formatAxis={(n) => fmtMoneyWhole(n, currency)}
      color="bg-[hsl(var(--chart-sales))]"
      emptyText="No sales on these dates."
      label="Average sales by weekday"
    />
  );
}
