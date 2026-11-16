import { todayIst } from './dates';

// The dashboard's date filter: presets (today, this week, month, quarter,
// half year, full year) plus any custom from–to range, each resolved to IST
// calendar dates (inclusive) and paired with a fair comparison period.
// Quarters, halves and years follow the Indian financial year (April–March).
// Plain module (no 'use server', no React) so the server page, the server
// actions and the client filter control share one definition.

export const DASHBOARD_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'half', label: 'Half year' },
  { id: 'year', label: 'Full year' },
] as const;

export type DashboardPreset = (typeof DASHBOARD_PRESETS)[number]['id'] | 'custom';

export type DashboardRange = {
  preset: DashboardPreset;
  /** First and last IST date of the period, inclusive. */
  from: string;
  to: string;
  /** The comparison period, inclusive. */
  prevFrom: string;
  prevTo: string;
  /** What the period is: "This quarter · Q3 (Oct–Dec)", "Custom · 12 days". */
  name: string;
  /** Its dates: "1 Oct – 16 Nov 2026". */
  dates: string;
  /** What it's compared with, dates included: "the same days of Q2 (1 Jul – 16 Aug 2026)". */
  previousLabel: string;
  /** Short name for card subtitles: "This quarter", "3–9 Nov 2026". */
  word: string;
  /** Days of the month gone and in total — the sales-target pace. This-month only. */
  monthDays: { elapsed: number; total: number } | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A real calendar date as `YYYY-MM-DD` (rejects "2026-02-31"). */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

export function shiftMonth(firstOfMonth: string, n: number): string {
  const d = new Date(`${firstOfMonth}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
function monthEnd(firstOfMonth: string): string {
  return addDays(shiftMonth(firstOfMonth, 1), -1);
}
const month = (date: string) => Number(date.slice(5, 7));
const year = (date: string) => Number(date.slice(0, 4));

/** Indian financial year start (1 April) for a date. */
export function fyStart(date: string): string {
  return month(date) >= 4 ? `${year(date)}-04-01` : `${year(date) - 1}-04-01`;
}
/** Financial-year quarter start: 1 Apr, 1 Jul, 1 Oct or 1 Jan. */
export function fyQuarterStart(date: string): string {
  const m = month(date);
  const start = m >= 10 ? 10 : m >= 7 ? 7 : m >= 4 ? 4 : 1;
  return `${year(date)}-${String(start).padStart(2, '0')}-01`;
}
/** Financial-year half start: 1 Apr (H1, Apr–Sep) or 1 Oct (H2, Oct–Mar). */
export function fyHalfStart(date: string): string {
  const m = month(date);
  if (m >= 10) return `${year(date)}-10-01`;
  if (m >= 4) return `${year(date)}-04-01`;
  return `${year(date) - 1}-10-01`;
}
function fyLabel(start: string): string {
  return `FY ${year(start)}-${String((year(start) + 1) % 100).padStart(2, '0')}`;
}
/** "Q3" for a quarter starting on `start`; with `months`, "Q3 (Oct–Dec)". */
function quarterName(start: string, months = false): string {
  const m = month(start);
  const q = m === 4 ? 1 : m === 7 ? 2 : m === 10 ? 3 : 4;
  return months ? `Q${q} (${MONTHS[m - 1]}–${MONTHS[(m + 1) % 12]})` : `Q${q}`;
}
/** "H2" for a half starting on `start`; with `months`, "H2 (Oct–Mar)". */
function halfName(start: string, months = false): string {
  const h = month(start) === 4 ? 'H1' : 'H2';
  return months ? `${h} (${h === 'H1' ? 'Apr–Sep' : 'Oct–Mar'})` : h;
}

/** "16 Nov" or "16 Nov 2026". */
export function dayText(date: string, withYear = false): string {
  return `${Number(date.slice(8))} ${MONTHS[month(date) - 1]}${withYear ? ` ${date.slice(0, 4)}` : ''}`;
}

/** "16 Nov 2026", "1–16 Nov 2026", "28 Oct – 3 Nov 2026", "28 Dec 2025 – 3 Jan 2026". */
export function spanText(from: string, to: string): string {
  if (from === to) return dayText(from, true);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${dayText(to, true)}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${dayText(from)} – ${dayText(to, true)}`;
  return `${dayText(from, true)} – ${dayText(to, true)}`;
}

/** The same number of days at the start of the previous period (`months`
 * long), never running past that period's end. */
function sameDaysBefore(from: string, today: string, months: number) {
  const prevFrom = shiftMonth(from, -months);
  const prevTo = [addDays(prevFrom, daysBetween(from, today)), addDays(from, -1)].sort()[0];
  return { prevFrom, prevTo };
}

/** The dashboard's period from the URL (`?period=` and, for a custom range,
 * `?from=&to=`). Anything unrecognised falls back to this month. Current
 * periods run to today and are compared with the same days of the one
 * before; a custom range is compared with the same number of days just
 * before it. */
export function resolveDashboardRange(params: { period?: string; from?: string; to?: string }, today = todayIst()): DashboardRange {
  const known = DASHBOARD_PRESETS.some((p) => p.id === params.period) || params.period === 'custom';
  const preset = (known ? params.period : 'month') as DashboardPreset;
  const make = (r: Omit<DashboardRange, 'preset' | 'monthDays' | 'dates'> & { preset?: DashboardPreset; monthDays?: DashboardRange['monthDays'] }): DashboardRange => ({
    preset: r.preset ?? preset,
    monthDays: r.monthDays ?? null,
    dates: spanText(r.from, r.to),
    ...r,
  });

  if (preset === 'custom' && isIsoDate(params.from) && isIsoDate(params.to)) {
    const [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    // Whole periods picked from the calendar or the year picker read as
    // themselves and compare with the one before: a financial year with the
    // last, a calendar year with the last, a month with the last month.
    const y = year(from);
    if (from.slice(5) === '04-01' && to === `${y + 1}-03-31`) {
      const prevFrom = `${y - 1}-04-01`;
      const prevTo = addDays(from, -1);
      return make({ from, to, prevFrom, prevTo, name: `${fyLabel(from)} (Apr–Mar)`, previousLabel: `${fyLabel(prevFrom)} (${spanText(prevFrom, prevTo)})`, word: fyLabel(from) });
    }
    if (from.slice(5) === '01-01' && to === `${y}-12-31`) {
      const prevFrom = `${y - 1}-01-01`;
      const prevTo = `${y - 1}-12-31`;
      return make({ from, to, prevFrom, prevTo, name: `Year ${y} (Jan–Dec)`, previousLabel: `${y - 1} (${spanText(prevFrom, prevTo)})`, word: `Year ${y}` });
    }
    if (from.slice(5) === '01-01' && to === today && year(today) === y) {
      const { prevFrom, prevTo } = sameDaysBefore(from, today, 12);
      return make({ from, to, prevFrom, prevTo, name: `${y} so far (Jan–Dec)`, previousLabel: `the same days of ${y - 1} (${spanText(prevFrom, prevTo)})`, word: `${y} so far` });
    }
    if (from.slice(8) === '01' && to === monthEnd(from)) {
      const prevFrom = shiftMonth(from, -1);
      const prevTo = monthEnd(prevFrom);
      const label = `${MONTHS_LONG[month(from) - 1]} ${y}`;
      return make({ from, to, prevFrom, prevTo, name: label, previousLabel: `${MONTHS_LONG[month(prevFrom) - 1]} ${year(prevFrom)}`, word: label });
    }
    const span = daysBetween(from, to) + 1;
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(span - 1));
    if (span === 1) {
      const weekday = new Date(`${from}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
      return make({ from, to, prevFrom, prevTo, name: `${weekday} · one day`, previousLabel: `the day before (${dayText(prevFrom, true)})`, word: dayText(from, true) });
    }
    return make({ from, to, prevFrom, prevTo, name: `Custom dates · ${span} days`, previousLabel: `the ${span} days before (${spanText(prevFrom, prevTo)})`, word: spanText(from, to) });
  }

  switch (preset) {
    case 'today': {
      const y = addDays(today, -1);
      return make({ from: today, to: today, prevFrom: y, prevTo: y, name: 'Today', previousLabel: `yesterday (${dayText(y, true)})`, word: 'Today' });
    }
    case 'week': {
      // Monday-start week, like the Invoices and Reports filters.
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
      const from = addDays(today, -(dow === 0 ? 6 : dow - 1));
      const prevFrom = addDays(from, -7);
      const prevTo = addDays(today, -7);
      return make({ from, to: today, prevFrom, prevTo, name: 'This week (from Monday)', previousLabel: `the same days last week (${spanText(prevFrom, prevTo)})`, word: 'This week' });
    }
    case 'quarter': {
      const from = fyQuarterStart(today);
      const { prevFrom, prevTo } = sameDaysBefore(from, today, 3);
      return make({ from, to: today, prevFrom, prevTo, name: `This quarter · ${quarterName(from, true)}`, previousLabel: `the same days of ${quarterName(prevFrom)} (${spanText(prevFrom, prevTo)})`, word: 'This quarter' });
    }
    case 'half': {
      const from = fyHalfStart(today);
      const { prevFrom, prevTo } = sameDaysBefore(from, today, 6);
      return make({ from, to: today, prevFrom, prevTo, name: `Half year · ${halfName(from, true)}`, previousLabel: `the same days of ${halfName(prevFrom)} (${spanText(prevFrom, prevTo)})`, word: 'This half-year' });
    }
    case 'year': {
      const from = fyStart(today);
      const { prevFrom, prevTo } = sameDaysBefore(from, today, 12);
      return make({ from, to: today, prevFrom, prevTo, name: `Full year · ${fyLabel(from)} (Apr–Mar)`, previousLabel: `the same days of ${fyLabel(prevFrom)} (${spanText(prevFrom, prevTo)})`, word: fyLabel(from) });
    }
    default: {
      // This month so far against the same days of last month (never past
      // its end — 31 Mar compares with 28/29 Feb).
      const from = monthStart(today);
      const { prevFrom, prevTo } = sameDaysBefore(from, today, 1);
      return make({
        preset: 'month',
        from,
        to: today,
        prevFrom,
        prevTo,
        name: `This month · ${MONTHS_LONG[month(from) - 1]}`,
        previousLabel: `the same days of ${MONTHS_LONG[month(prevFrom) - 1]} (${spanText(prevFrom, prevTo)})`,
        word: 'This month',
        monthDays: { elapsed: Number(today.slice(8)), total: daysBetween(from, shiftMonth(from, 1)) },
      });
    }
  }
}

/** Handy ranges for the Custom panel (inclusive IST dates). */
export function quickRanges(today = todayIst()): { label: string; from: string; to: string }[] {
  const y = addDays(today, -1);
  const lastMonth = shiftMonth(monthStart(today), -1);
  const q = fyQuarterStart(today);
  const lastQ = shiftMonth(q, -3);
  const fy = fyStart(today);
  const lastFy = shiftMonth(fy, -12);
  return [
    { label: 'Yesterday', from: y, to: y },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'Last 30 days', from: addDays(today, -29), to: today },
    { label: 'Last month', from: lastMonth, to: monthEnd(lastMonth) },
    { label: 'Last quarter', from: lastQ, to: addDays(q, -1) },
    { label: `Last FY (${fyLabel(lastFy).slice(3)})`, from: lastFy, to: addDays(fy, -1) },
  ];
}
