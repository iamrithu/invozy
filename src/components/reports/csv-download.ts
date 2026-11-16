import { CSV_BOM, csvRow, exportFileName, type CsvCell } from '@/lib/csv';

/** Saves rows already on screen as an Excel-ready CSV — same BOM, quoting
 * and formula-injection guard as the server exports (src/lib/csv.ts), but
 * built in the browser from the loaded report, so what downloads is
 * exactly what the table shows (search and sort included) with no second
 * query. Named like the server exports: `asb-<kind>-<range>.csv`. */
export function downloadCsv(kind: string, range: { from?: string; to?: string }, header: string[], rows: CsvCell[][]): void {
  const text = CSV_BOM + csvRow(header) + rows.map(csvRow).join('');
  const href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = exportFileName(kind, range, 'csv');
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
