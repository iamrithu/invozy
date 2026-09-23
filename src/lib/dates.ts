// India-only app, but nothing else in this codebase pins dates to IST —
// `new Date(dateString)` parses as UTC midnight, and every "is this
// overdue" check elsewhere is a bare UTC compare. A server running in UTC
// (the common case for Vercel/Node hosts) would otherwise compute "today"
// up to 5.5 hours off from what an India-based user actually means by it.
// These two helpers use a fixed +05:30 offset (India has no DST) rather
// than the runtime's own timezone, so they're correct whether they run on
// a UTC server or in any browser.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's calendar date in IST, as `YYYY-MM-DD`. */
export function todayIst(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The `[start, end)` UTC instant range covering one IST calendar day —
 * e.g. `"2026-09-21"` becomes `[2026-09-20T18:30:00Z, 2026-09-21T18:30:00Z)`.
 * Used to filter a plain UTC timestamp column (like `Invoice.date`) by IST
 * calendar day. */
export function istDayRangeUtc(dateStr: string): { gte: Date; lt: Date } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`);
  return { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Shared date-range filter modes — used by both the Invoices list and the
 * Reports page (see src/components/filters/date-range-filter.tsx) so the
 * two screens offer the exact same date vocabulary. */
export type DateFilterMode = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

/** Resolves a DateFilterMode to concrete IST calendar-date bounds
 * (`YYYY-MM-DD`, inclusive on both ends) ready to hand to `istDayRangeUtc`.
 * `'all'` returns `{}` (no bound, matching every historical row); `'custom'`
 * just passes the caller's own from/to through unchanged (empty string
 * becomes `undefined`, i.e. an open-ended bound on that side). */
export function resolveDateRange(mode: DateFilterMode, customFrom?: string, customTo?: string): { from?: string; to?: string } {
  if (mode === 'all') return {};
  if (mode === 'custom') return { from: customFrom || undefined, to: customTo || undefined };

  const today = todayIst();
  if (mode === 'today') return { from: today, to: today };

  const [y, m, d] = today.split('-').map(Number);
  if (mode === 'week') {
    // Monday-start week, matching Indian business-week convention.
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dt.getUTCDay(); // 0 = Sunday .. 6 = Saturday
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    dt.setUTCDate(dt.getUTCDate() - daysSinceMonday);
    return { from: dt.toISOString().slice(0, 10), to: today };
  }
  if (mode === 'month') return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: today };
  if (mode === 'year') return { from: `${y}-01-01`, to: today };
  return {};
}
