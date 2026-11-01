// CSV for Excel. Two things decide whether an export "just opens" in Excel
// on an Indian Windows laptop:
//
// - A UTF-8 byte-order mark first. Without it Excel assumes the system code
//   page, so ₹ and Tamil shop names arrive as mojibake ("â‚¹").
// - RFC 4180 quoting: any cell holding a comma, quote, CR or LF is wrapped
//   in quotes with inner quotes doubled — addresses are full of commas and
//   newlines.
//
// Cells that start with = + - @ (or a tab/CR) are prefixed with an
// apostrophe so a customer named "=HYPERLINK(…)" can't run as a formula
// when the file is opened ("CSV injection"). Real numbers are written as
// numbers, never through that path, so negative amounts stay summable; a
// phone number like "+91 98400 12345" is left alone too.

export const CSV_BOM = '﻿';

export type CsvCell = string | number | boolean | Date | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const PHONE_LIKE = /^[+-][\d\s().-]*$/;

/** One cell, quoted only when it needs to be. Numbers are rounded to 2
 * decimals unless they're whole; Dates become their IST calendar date. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return istDate(value);
  let s = String(value);
  if (FORMULA_START.test(s) && !PHONE_LIKE.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV line (CRLF-terminated — what Excel itself writes). */
export function csvRow(cells: CsvCell[]): string {
  return cells.map(csvCell).join(',') + '\r\n';
}

/** A Date as its India calendar date, `YYYY-MM-DD` — a format every Excel
 * locale reads as a real date. Invoice/payment dates are stored at UTC
 * midnight of their calendar day and timestamps (stock movements) at the
 * real instant; shifting by +05:30 gives the right day for both. */
export function istDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** `asb-invoices-2026-10-01-to-2026-10-31.csv`, `asb-invoices-all-time.csv`
 * (no range), or `asb-customers-2026-10-31.csv` for snapshot exports that
 * aren't date-bound (pass `snapshotDate`). */
export function exportFileName(kind: string, range: { from?: string; to?: string }, ext: string, snapshotDate?: string): string {
  let suffix: string;
  if (snapshotDate) suffix = snapshotDate;
  else if (range.from && range.to) suffix = range.from === range.to ? range.from : `${range.from}-to-${range.to}`;
  else if (range.from) suffix = `from-${range.from}`;
  else if (range.to) suffix = `to-${range.to}`;
  else suffix = 'all-time';
  return `asb-${kind}-${suffix}.${ext}`;
}

/** Streams a CSV — BOM, header row, then whatever `rows` yields, pulled
 * one batch at a time so a year of invoice lines never sits in memory as
 * one giant string. `rows` should page through the database itself. */
export function csvStream(header: string[], rows: AsyncIterable<CsvCell[][]>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = rows[Symbol.asyncIterator]();
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(encoder.encode(CSV_BOM + csvRow(header)));
          return;
        }
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        if (value.length) controller.enqueue(encoder.encode(value.map(csvRow).join('')));
      } catch (e) {
        // Headers are already sent, so the best we can do is cut the file
        // short — the browser reports the download as failed rather than
        // saving a silently truncated file.
        console.error('CSV export failed mid-stream', e);
        controller.error(e);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/** Response headers for a CSV download. Content-Disposition carries both a
 * plain filename and the RFC 5987 form so any browser keeps the name. */
export function csvHeaders(fileName: string): HeadersInit {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'Cache-Control': 'private, no-store',
  };
}
