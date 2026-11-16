// The company's PDF layout settings (Company → PDF layout), kept in the
// AppSetting table under 'pdf.layout'. Plain module — no Prisma, no React —
// so the settings reader, the print pages, the PDF renderer and the
// browser-side page planner all share one shape and one set of limits.

export type RowSpacing = 'compact' | 'normal' | 'relaxed';

export type PdfLayout = {
  /** Paper margins in mm (A4, 210 × 297). */
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Vertical space inside each item row. */
  rowSpacing: RowSpacing;
  /** Most item rows on a page that doesn't carry the totals. */
  maxRowsPerPage: number;
  /** Most item rows on the page that carries the totals. */
  maxRowsWithTotals: number;
  /** Rows that always travel with the totals (0: a page of totals alone is fine). */
  keepWithTotals: number;
  /** "Carried forward" / "Brought forward" item totals on continued pages. */
  carryForward: boolean;
  /** Totals (and the "continued" strip) sit at the foot of every page —
   * a page of totals alone included — with the column lines run down to them. */
  fillColumns: boolean;
  /** The footer line on every page: "computer-generated" note and Page x of y. */
  pageFooter: boolean;
};

export const DEFAULT_PDF_LAYOUT: PdfLayout = {
  marginTop: 14,
  marginBottom: 14,
  marginLeft: 12,
  marginRight: 12,
  rowSpacing: 'normal',
  maxRowsPerPage: 20,
  maxRowsWithTotals: 14,
  keepWithTotals: 0,
  carryForward: true,
  fillColumns: true,
  pageFooter: true,
};

export const PDF_LIMITS = {
  margin: { min: 5, max: 30 },
  rows: { min: 5, max: 40 },
  rowsWithTotals: { min: 1, max: 40 },
  keep: { min: 0, max: 5 },
} as const;

export const A4 = { widthMm: 210, heightMm: 297 } as const;

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 2) / 2)) : fallback;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Any stored or submitted value → a valid layout (defaults fill gaps,
 * numbers are clamped to sensible limits, half-millimetre steps). */
export function normalizePdfLayout(v: unknown): PdfLayout {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_PDF_LAYOUT;
  const m = PDF_LIMITS.margin;
  const maxRowsPerPage = Math.round(clamp(o.maxRowsPerPage, PDF_LIMITS.rows.min, PDF_LIMITS.rows.max, d.maxRowsPerPage));
  return {
    marginTop: clamp(o.marginTop, m.min, m.max, d.marginTop),
    marginBottom: clamp(o.marginBottom, m.min, m.max, d.marginBottom),
    marginLeft: clamp(o.marginLeft, m.min, m.max, d.marginLeft),
    marginRight: clamp(o.marginRight, m.min, m.max, d.marginRight),
    rowSpacing: o.rowSpacing === 'compact' || o.rowSpacing === 'relaxed' ? o.rowSpacing : 'normal',
    maxRowsPerPage,
    // The totals page can't be allowed more rows than any other page.
    maxRowsWithTotals: Math.min(maxRowsPerPage, Math.round(clamp(o.maxRowsWithTotals, PDF_LIMITS.rowsWithTotals.min, PDF_LIMITS.rowsWithTotals.max, d.maxRowsWithTotals))),
    keepWithTotals: Math.round(clamp(o.keepWithTotals, PDF_LIMITS.keep.min, PDF_LIMITS.keep.max, d.keepWithTotals)),
    carryForward: bool(o.carryForward, d.carryForward),
    fillColumns: bool(o.fillColumns, d.fillColumns),
    pageFooter: bool(o.pageFooter, d.pageFooter),
  };
}

/** Width of the printable content box in mm — what print pages lay out at
 * and the PDF renderer's viewport is sized to. */
export function contentWidthMm(l: PdfLayout): number {
  return A4.widthMm - l.marginLeft - l.marginRight;
}

/** Height of the printable content box in mm. */
export function contentHeightMm(l: PdfLayout): number {
  return A4.heightMm - l.marginTop - l.marginBottom;
}

/** The browser's own Print (Ctrl+P) uses the same margins as the PDF. */
export function pageMarginCss(l: PdfLayout): string {
  return `@media print { @page { size: A4; margin: ${l.marginTop}mm ${l.marginRight}mm ${l.marginBottom}mm ${l.marginLeft}mm; } }`;
}
