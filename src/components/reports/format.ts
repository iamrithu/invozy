// Display helpers shared by the Reports tabs. Pure functions, no React —
// so the CSV builders and the components format figures the same way.

const LOCALE: Record<string, string> = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB', AED: 'en-AE' };

/** "₹1,23,456" — whole rupees written out in full with Indian digit
 * grouping, for chart axes and other tight labels. (Amounts stated in text
 * use fmtInr from src/lib/gst.ts, paise included.) Same locale pairing as
 * fmtInr, so INR gets lakh/crore grouping. */
export function fmtMoneyWhole(n: number, currency = 'INR'): string {
  return new Intl.NumberFormat(LOCALE[currency] ?? 'en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(n || 0));
}

/** 0.4567 → "45.7%" (or "46%" with digits = 0). */
export function fmtPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** "2026-11-03" → "3 Nov 2026" (or "3 Nov" without the year). */
export function fmtDay(iso: string, withYear = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

/** "All time", "31 Oct 2026", "1 Oct – 31 Oct 2026" — what a range of IST
 * calendar dates reads as in headings and the export menu. */
export function rangeLabel(from?: string, to?: string): string {
  if (!from && !to) return 'All time';
  if (from && to) return from === to ? fmtDay(from) : `${fmtDay(from, from.slice(0, 4) !== to.slice(0, 4))} – ${fmtDay(to)}`;
  return from ? `From ${fmtDay(from)}` : `Until ${fmtDay(to!)}`;
}

/** "1 day", "12 days". */
export function daysText(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r} day${r === 1 ? '' : 's'}`;
}
