'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { contentHeightMm, DEFAULT_PDF_LAYOUT, type PdfLayout } from '@/lib/pdf-layout';

// ---------------------------------------------------------------------------
// Shared print pagination for all three invoice templates (Modern, Classic,
// Clean): splits the line items into physical A4 pages for the PDF/print
// path.
//
// Earlier versions used hardcoded mm-per-section budgets, then a single
// sample row height — both broke on real data (a two-line address, a long
// product name that wraps), and the browser's own pagination silently took
// over mid-flow, stranding rows or the totals on a near-blank page. This
// module measures each invoice's *actual* rendered sections and every row
// at render time (useMeasuredLayout), then plans the pages from those real
// numbers within the company's PDF layout settings (src/lib/pdf-layout.ts:
// margins, rows per page, rows with the totals).
// ---------------------------------------------------------------------------

const PX_PER_MM = 96 / 25.4;
export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

// ---------------------------------------------------------------------------
// Fill-first page planning (all templates)
//
// What paginateLinesUniform got wrong for long invoices: it assumed every
// row is as tall as one sample row, spread rows *evenly* across pages
// instead of filling them, budgeted only 250mm of the 269mm content box,
// and never planned where the closing block (totals, words, bank, terms,
// signature) lands — Chromium's own pagination pushed it wherever it fell.
// A 12-item invoice came out as 10 rows + a page of white, then 2 rows and
// the totals overleaf.
//
// planPages measures instead of guessing and decides everything up front:
//   · every row's real height (a long product name wraps to two lines);
//   · page 1 = full letterhead + buyer block; pages 2+ = a slim
//     continuation header (number, customer, page n of N, brought forward);
//   · each non-last page is filled with as many rows as fit above a small
//     "Continued on page n+1 · carried forward ₹…" strip — but never more
//     than the layout's rows-per-page (20 by default);
//   · the closing block goes on the page where the remaining rows (at most
//     rows-with-totals, 14 by default) and it fit together. With
//     `keepWithClosing` 0 (the default) a page of totals alone is fine;
//     above 0, that many rows always travel with the totals.
// ---------------------------------------------------------------------------

export type LayoutHeights = {
  header: number;
  buyer: number;
  /** Slim header on pages 2+. */
  contHeader: number;
  thead: number;
  /** One per line item, in order. */
  rows: number[];
  /** "Continued on page n+1" strip under a non-last page's rows. */
  contFooter: number;
  closing: number;
};

export type PlannedPage = { start: number; end: number; closing: boolean };

export type PlanOptions = {
  /** Planned content height of one page, px. */
  budget: number;
  /** Most rows on a page without the totals (20 by default). */
  maxRows: number;
  /** Most rows on the page with the totals (14 by default). */
  maxRowsWithClosing: number;
  /** Rows that always go with the totals (0 by default: totals may stand alone). */
  keepWithClosing: number;
};

/** Page budgets for a layout: what pages are planned against, and how far
 * the CLEAN frame's column lines are drawn (closer to the true content
 * height — only ever applied to sections already measured to fit). */
export function pageBudgets(layout: PdfLayout): { planPx: number; fillPx: number } {
  const content = contentHeightMm(layout);
  return { planPx: mmToPx(content - 9), fillPx: mmToPx(content - 7) };
}

export function planOptions(layout: PdfLayout): PlanOptions {
  return {
    budget: pageBudgets(layout).planPx,
    maxRows: layout.maxRowsPerPage,
    maxRowsWithClosing: layout.maxRowsWithTotals,
    keepWithClosing: layout.keepWithTotals,
  };
}

/** Fill-first page plan — see the section comment above. Returns row index
 * ranges ([start, end)) per page; exactly one page (the last) carries the
 * closing block. A page holds as many rows as fit by measured height, but
 * never more than `maxRows` — or `maxRowsWithClosing` on the page with the
 * totals. */
export function planPages(h: LayoutHeights, opts: PlanOptions = planOptions(DEFAULT_PDF_LAYOUT)): PlannedPage[] {
  const { budget, maxRows, maxRowsWithClosing, keepWithClosing } = opts;
  const n = h.rows.length;
  const pages: PlannedPage[] = [];
  const sum = (a: number, b: number) => h.rows.slice(a, b).reduce((s, x) => s + x, 0);
  // A closing block taller than a whole continuation page can't be planned
  // around — fill pages fully and let it flow on after the last rows, its
  // own break-inside-avoid sections keeping each part intact.
  const closingFitsAPage = h.contHeader + h.thead + h.closing <= budget;
  let i = 0;

  while (pages.length < 1000) {
    const first = pages.length === 0;
    const top = (first ? h.header + h.buyer : h.contHeader) + h.thead;

    // Everything left fits here with the closing block: done.
    if (n - i <= maxRowsWithClosing && top + sum(i, n) + h.closing <= budget) {
      pages.push({ start: i, end: n, closing: true });
      return pages;
    }
    if (i >= n) {
      pages.push({ start: n, end: n, closing: true });
      return pages;
    }

    // Fill this page, leaving room for the "continued" strip.
    const cap = budget - top - h.contFooter;
    let take = 0;
    let used = 0;
    while (i + take < n && take < maxRows && used + h.rows[i + take] <= cap) {
      used += h.rows[i + take];
      take++;
    }

    if (!closingFitsAPage) {
      take = Math.max(1, take);
      const end = i + take;
      pages.push({ start: i, end, closing: end === n });
      if (end === n) return pages;
      i = end;
      continue;
    }

    // Keep at least `keepWithClosing` rows for the page with the totals —
    // never leaving this page without a row, and only when those rows and
    // the closing block really fit together on a page.
    const left = n - (i + take);
    if (left < keepWithClosing) {
      const hold = Math.min(keepWithClosing - left, take - 1);
      if (hold > 0 && h.contHeader + h.thead + sum(i + take - hold, n) + h.closing <= budget) take -= hold;
    }
    take = Math.max(1, take);
    pages.push({ start: i, end: i + take, closing: false });
    i += take;
  }
  pages.push({ start: i, end: n, closing: true });
  return pages;
}

export type LayoutProbe = {
  header: ReactNode;
  buyer: ReactNode;
  contHeader: ReactNode;
  itemsTableHead: ReactNode;
  itemsTableClassName?: string;
  /** The items table's wrapper class (a top rule, say) — the whole block,
   * wrapper and table margins included, is what gets measured. */
  itemsWrapClassName?: string;
  /** Every row's `<td>` cells, in order — each one measured. */
  rows: ReactNode[];
  /** The printed rows' own class (row rules add height). */
  rowClassName?: string;
  contFooter: ReactNode;
  closing: ReactNode;
  /** The page frame's own class (its border). The probe is measured inside
   * the same frame so every width matches the printed page to the pixel —
   * a 1px border each side was enough to wrap a long product name onto a
   * third line on the page but not in the probe. */
  frameClassName?: string;
};

/** Like useMeasuredSections, but measures every row (and the continuation
 * header/strip) so planPages works from real heights. Same once-on-mount,
 * re-measure-after-fonts behaviour and the same hidden, positioned probe. */
export function useMeasuredLayout(content: LayoutProbe): { heights: LayoutHeights | null; ready: boolean; probe: ReactNode } {
  const headerRef = useRef<HTMLDivElement>(null);
  const buyerRef = useRef<HTMLDivElement>(null);
  const contHeaderRef = useRef<HTMLDivElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const contFooterRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<LayoutHeights | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const h = (el: Element | null | undefined) => el?.getBoundingClientRect().height ?? 0;
    const measure = () => {
      const rows = Array.from(tbodyRef.current?.rows ?? []).map((r) => h(r));
      setHeights({
        header: h(headerRef.current),
        buyer: h(buyerRef.current),
        contHeader: h(contHeaderRef.current),
        // Everything in the items block that isn't a row: column headings,
        // the wrapper's rule, the table's own margin.
        thead: h(tableWrapRef.current) - rows.reduce((s, x) => s + x, 0),
        rows,
        contFooter: h(contFooterRef.current),
        closing: h(closingRef.current),
      });
    };
    measure();
    let cancelled = false;
    const fontsReady = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => {
      if (cancelled) return;
      measure();
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // Measure once on mount only — see useMeasuredSections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const probe = ready ? null : (
    <div
      aria-hidden="true"
      data-measure-probe=""
      style={{ position: 'absolute', visibility: 'hidden', top: 0, left: 0, width: '100%', zIndex: -1, pointerEvents: 'none' }}
    >
      <div className={content.frameClassName}>
      <div ref={headerRef}>{content.header}</div>
      <div ref={buyerRef}>{content.buyer}</div>
      <div ref={contHeaderRef}>{content.contHeader}</div>
      <div ref={tableWrapRef} className={content.itemsWrapClassName} style={{ display: 'flow-root' }}>
        <table className={content.itemsTableClassName} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>{content.itemsTableHead}</thead>
          <tbody ref={tbodyRef}>
            {content.rows.map((cells, k) => (
              <tr key={k} className={content.rowClassName}>
                {cells}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div ref={contFooterRef}>{content.contFooter}</div>
      <div ref={closingRef}>{content.closing}</div>
      </div>
    </div>
  );

  return { heights, ready, probe };
}
