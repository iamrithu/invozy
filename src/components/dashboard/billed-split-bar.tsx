'use client';

import { SegmentedBar, type BarSegment } from '@/components/charts/segmented-bar';
import { fmtCompactMoney } from '@/components/reports/format';

/** SegmentedBar with short money labels, for server-rendered pages — a
 * server component can't hand a client one its `format` function. */
export function BilledSplitBar({ segments, currency, label }: { segments: BarSegment[]; currency: string; label: string }) {
  return <SegmentedBar segments={segments} format={(n) => fmtCompactMoney(n, currency)} label={label} />;
}
