import { todayIst } from './dates';

// The dashboard's date filter: a few presets plus any custom from–to range,
// each resolved to IST calendar dates (inclusive) and paired with a fair
// comparison period. Plain module (no 'use server', no React) so the server
// page, the server actions and the client filter control share one list.

export const DASHBOARD_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'lastmonth', label: 'Last month' },
  { id: 'fy', label: 'This FY' },
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
  /** "1–16 Nov 2026", "Today, 16 Nov", "FY 2026-27 so far". */
  label: string;
  /** What it's compared with: "1–16 Oct 2026", "yesterday", "the same days of FY 2025-26". */
  previousLabel: string;
  /** Short name for card subtitles: "This month", "3–9 Nov 2026". */
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

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
function shiftMonth(firstOfMonth: string, n: number): string {
  const d = new Date(`${firstOfMonth}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
function monthEnd(firstOfMonth: string): string {
  return addDays(shiftMonth(firstOfMonth, 1), -1);
}
/** Indian financial year start (1 April) for a date. */
function fyStart(date: string): string {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 4 ? `${y}-04-01` : `${y - 1}-04-01`;
}
function fyLabel(start: string): string {
  const y = Number(start.slice(0, 4));
  return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** "16 Nov" or "16 Nov 2026". */
export function dayText(date: string, withYear = false): string {
  return `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}${withYear ? ` ${date.slice(0, 4)}` : ''}`;
}

/** "16 Nov 2026", "1–16 Nov 2026", "28 Oct – 3 Nov 2026", "28 Dec 2025 – 3 Jan 2026". */
export function spanText(from: string, to: string): string {
  if (from === to) return dayText(from, true);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${dayText(to, true)}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${dayText(from)} – ${dayText(to, true)}`;
  return `${dayText(from, true)} – ${dayText(to, true)}`;
}

function monthName(firstOfMonth: string): string {
  return `${MONTHS_LONG[Number(firstOfMonth.slice(5, 7)) - 1]} ${firstOfMonth.slice(0, 4)}`;
}

/** The dashboard's period from the URL (`?period=` and, for a custom range,
 * `?from=&to=`). Anything unrecognised falls back to this month. Each
 * period is compared with a fair one: today with yesterday, this week and
 * this month so far with the same days of the last one, last month with the
 * month before, this FY so far with the same days of the last FY, and a
 * custom range with the same number of days just before it. */
export function resolveDashboardRange(params: { period?: string; from?: string; to?: string }, today = todayIst()): DashboardRange {
  const preset = (DASHBOARD_PRESETS.some((p) => p.id === params.period) || params.period === 'custom' ? params.period : 'month') as DashboardPreset;
  const base = { preset, monthDays: null as DashboardRange['monthDays'] };

  if (preset === 'custom' && isIsoDate(params.from) && isIsoDate(params.to)) {
    const [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    const span = daysBetween(from, to) + 1;
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(span - 1));
    const label = spanText(from, to);
    return { ...base, from, to, prevFrom, prevTo, label, previousLabel: `the ${span === 1 ? 'day' : `${span} days`} before (${spanText(prevFrom, prevTo)})`, word: label };
  }

  switch (preset) {
    case 'today': {
      const y = addDays(today, -1);
      return { ...base, from: today, to: today, prevFrom: y, prevTo: y, label: `Today, ${dayText(today)}`, previousLabel: 'yesterday', word: 'Today' };
    }
    case 'yesterday': {
      const y = addDays(today, -1);
      const b = addDays(today, -2);
      return { ...base, from: y, to: y, prevFrom: b, prevTo: b, label: `Yesterday, ${dayText(y)}`, previousLabel: `the day before (${dayText(b)})`, word: 'Yesterday' };
    }
    case 'week': {
      // Monday-start week, like the Invoices and Reports filters.
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
      const from = addDays(today, -(dow === 0 ? 6 : dow - 1));
      const prevFrom = addDays(from, -7);
      const prevTo = addDays(today, -7);
      return { ...base, from, to: today, prevFrom, prevTo, label: `This week, ${spanText(from, today)}`, previousLabel: `the same days last week (${spanText(prevFrom, prevTo)})`, word: 'This week' };
    }
    case 'lastmonth': {
      const from = shiftMonth(monthStart(today), -1);
      const prevFrom = shiftMonth(from, -1);
      return { ...base, from, to: monthEnd(from), prevFrom, prevTo: monthEnd(prevFrom), label: monthName(from), previousLabel: monthName(prevFrom), word: 'Last month' };
    }
    case 'fy': {
      const from = fyStart(today);
      const prevFrom = fyStart(addDays(from, -1));
      // Same number of days into last year, never past its end.
      const prevTo = [addDays(prevFrom, daysBetween(from, today)), addDays(from, -1)].sort()[0];
      return { ...base, from, to: today, prevFrom, prevTo, label: `${fyLabel(from)} so far`, previousLabel: `the same days of ${fyLabel(prevFrom)}`, word: 'This FY' };
    }
    default: {
      // This month so far against the same days of last month (never past
      // its end — 31 Mar compares with 28/29 Feb).
      const from = monthStart(today);
      const prevFrom = shiftMonth(from, -1);
      const prevTo = [addDays(prevFrom, Number(today.slice(8)) - 1), monthEnd(prevFrom)].sort()[0];
      const total = daysBetween(from, shiftMonth(from, 1));
      return {
        ...base,
        preset: 'month',
        from,
        to: today,
        prevFrom,
        prevTo,
        label: spanText(from, today),
        previousLabel: spanText(prevFrom, prevTo),
        word: 'This month',
        monthDays: { elapsed: Number(today.slice(8)), total },
      };
    }
  }
}
