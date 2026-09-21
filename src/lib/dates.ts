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
