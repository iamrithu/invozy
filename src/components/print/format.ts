// Formatting for printed documents (credit notes, receipts, statements) —
// pure, no server imports, so the on-screen previews and the PDF print
// pages format every figure identically.

import { formatInvoiceDate, formatUnit } from '@/lib/gst';
import { amountToWordsWithPaise } from '@/lib/number-to-words';

const AMOUNT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1,23,456.00" — always two decimals, Indian grouping, a real minus
 * sign. Table cells use this bare; the column header carries the ₹. */
export function fmtAmount(n: number): string {
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return (v < 0 ? '−' : '') + AMOUNT.format(Math.abs(v));
}

/** "₹1,23,456.00" / "−₹50.00" — for totals and single figures. */
export function fmtRupees(n: number): string {
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return (v < 0 ? '−' : '') + '₹' + AMOUNT.format(Math.abs(v));
}

/** "Rupees One Thousand Two Hundred and Fifty Paise Only". */
export function rupeesInWords(n: number): string {
  return `Rupees ${amountToWordsWithPaise(Math.abs(n))} Only`;
}

/** `YYYY-MM-DD` → "31/10/2026" — same day/month order as the invoices. */
export function fmtDocDate(iso: string | null | undefined): string {
  return formatInvoiceDate(iso);
}

/** The IST calendar date of a stored timestamp, as `YYYY-MM-DD`. Document
 * dates are saved as UTC midnight of the chosen day, which this maps back
 * to that same day; anything stored with a time of day lands on its
 * India-time date rather than the server's. */
export function istDateString(d: Date): string {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "12", "2.5", "0.333" — no trailing zeros. */
export function fmtQty(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** "12 Box". */
export function fmtQtyUnit(qty: number, unit: string): string {
  return `${fmtQty(qty)} ${formatUnit(unit)}`.trim();
}

/** "CN/26-27/0001" → "CN-26-27-0001.pdf" — the same rule as invoice PDFs
 * (src/lib/invoice-pdf.ts invoicePdfFileName), usable client-side. */
export function pdfFileName(documentNumber: string): string {
  return `${documentNumber.replace(/[\\/]+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
}
