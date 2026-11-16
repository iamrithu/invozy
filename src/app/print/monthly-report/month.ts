// Calendar-month helpers for the monthly report — pure, so the print page,
// the PDF route, src/lib/monthly-report-pdf.ts and the Export menu's month
// picker all agree on what "2026-10" means.

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `YYYY-MM`, a real month. */
export function isReportMonth(value: string | null | undefined): value is string {
  return !!value && MONTH.test(value);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** First and last IST calendar day of the month, `YYYY-MM-DD`. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

/** The month before, `YYYY-MM`. */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/** "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The last complete month before the given IST date (`YYYY-MM-DD`) — what
 * the report defaults to, and what a 1st-of-the-month email sends. */
export function lastCompleteMonth(todayIst: string): string {
  return previousMonth(todayIst.slice(0, 7));
}

/** `report-2026-10.pdf`. */
export function monthlyReportFileName(month: string): string {
  return `report-${month}.pdf`;
}
