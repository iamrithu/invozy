'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Shared print pagination — used by both InvoiceSheet (MODERN) and
// InvoiceSheetClassic (CLASSIC) to split line items into physical A4 pages
// for the PDF/print path.
//
// Earlier versions of this logic (still visible in invoice-sheet-classic.tsx
// history) used hardcoded mm-per-section budgets (header ≈32mm, buyer
// ≈26mm, etc.), measured once during development against one particular
// company's data. That broke in production the moment a real company's
// content didn't match the guess — e.g. a two-line wrapping address makes
// the real header taller than the constant assumed, so the true content for
// what should be one page overflows past the physical page boundary and the
// browser's own pagination silently takes over mid-flow, stranding a lone
// item (and sometimes the whole closing block) on its own near-blank page.
//
// This module instead measures each invoice's *actual* rendered section
// heights at render time (see useMeasuredSections below) and computes the
// page split from those real numbers, so it stays correct regardless of how
// long a given company's address, notes, or optional sections happen to be.
// ---------------------------------------------------------------------------

const PX_PER_MM = 96 / 25.4;
export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

/** A4 usable content height (297mm page, 14mm top+bottom margins — matches
 * both `@page` in globals.css and the PDF route's `page.pdf()` margins),
 * minus a safety band. This one is genuinely template-agnostic — every
 * physical page both templates print to has the same shape — so, unlike
 * the section heights below, it doesn't need measuring.
 *
 * The safety band here is deliberately generous (269mm true usable → 250mm
 * budget, ~19mm/~72px of slack) rather than trimmed close to the true
 * limit: a last page whose content is pushed to fill this height exactly
 * (see the `minHeight: ${USABLE_MM}mm` usage on each template's last-page
 * container) has zero margin left to absorb any small mismatch between
 * this module's mm→px conversion and whatever Chromium's own print
 * pagination actually uses internally — confirmed empirically to matter:
 * a last page computed against a slimmer budget measured as fitting
 * exactly, by getBoundingClientRect(), in the normal DOM, yet still
 * silently overflowed onto an extra, near-blank physical page once
 * through the real PDF route. `USABLE_MM` is exported (not just the
 * derived px value) specifically so every place that needs this number —
 * the capacity math below and each template's last-page min-height style —
 * reads from the exact same source instead of a second hardcoded value
 * that could silently drift out of sync with it. */
export const USABLE_MM = 250;
export const USABLE_PX = mmToPx(USABLE_MM);
export const ENDBAND_PX = mmToPx(10);

export type PaginationResult<T> = {
  pages: T[][];
};

/** Splits line items into physical pages. A short invoice that fits —
 * header + buyer + every item + the full closing block, all together —
 * stays a single page. Otherwise, non-last pages are packed as full as
 * `perPage` allows (spread evenly *among themselves* when there's more
 * than one, so an early continuation page never sits mostly blank while a
 * later one is dense) and only the genuinely last page — which drops the
 * buyer block to make room for the closing block instead — absorbs
 * whatever remains, never exceeding `lastCap`.
 *
 * The buyer block (customer name/address/GSTIN, delivery instructions)
 * always shows somewhere — either on the single page, when everything fits
 * together, or on page 1 of a genuine multi-page split. An earlier version
 * of this function also allowed a single page to drop the buyer block
 * entirely to squeeze in a few more items without spilling onto a second
 * page; that traded away information the buyer/delivery crew actually
 * needs off of every invoice, which isn't a trade this app makes anymore —
 * a slightly-over-capacity invoice now genuinely paginates instead.
 *
 * An even earlier version spread the total evenly across *every* page,
 * last page included — e.g. a 3-item invoice whose closing block alone
 * (HSN summary, bank details, QR, declaration, signatures — the CLASSIC
 * template's is tall) left room for only 2 items on a single page came out
 * [2, 1]: two items on page 1 with most of the page sitting blank, and the
 * third item stranded alone on page 2. That was worried about a genuinely
 * different failure mode — a *non-last* page left sparse by greedily
 * packing every earlier page to its cap — but the true last page never has
 * that problem: it's always stretched to the full physical page height by
 * the `lastPageSpacerPx` spacer at the call site, closing block anchored to
 * the bottom, regardless of how few items land on it. Treating the last
 * page's small, structurally-fixed `lastCap` (it alone carries the whole
 * closing block) as just another page to spread evenly into was starving
 * every earlier page of room it actually had. Now only the non-last pages
 * split evenly among each other; the last page simply takes what's left. */
export function paginateLines<T>(lines: T[], perPage: number, singleCap: number, lastCap: number): PaginationResult<T> {
  const total = lines.length;
  if (total <= singleCap) return { pages: [lines] };

  // Fewest pages that can hold everything: every page but the last can hold
  // up to `perPage` items (it only has to make room for the small
  // "Continued on page N" footer below it), the last page up to `lastCap`
  // (it carries the full closing block instead).
  let pageCount = 2;
  while ((pageCount - 1) * perPage + lastCap < total) pageCount++;

  const nonLastPages = pageCount - 1;
  // Whatever doesn't fit within the non-last pages' combined `perPage`
  // capacity has to land on the last page — guaranteed by the `pageCount`
  // loop above to never exceed `lastCap`.
  const lastCount = Math.max(0, total - nonLastPages * perPage);
  let remaining = total - lastCount;

  const counts = new Array(pageCount).fill(0);
  for (let i = 0; i < nonLastPages; i++) {
    const pagesLeft = nonLastPages - i;
    const take = Math.min(perPage, Math.ceil(remaining / pagesLeft));
    counts[i] = take;
    remaining -= take;
  }
  counts[pageCount - 1] = lastCount;

  const pages: T[][] = [];
  let idx = 0;
  for (const c of counts) {
    pages.push(lines.slice(idx, idx + c));
    idx += c;
  }
  return { pages };
}

export type MeasuredHeights = {
  header: number;
  buyer: number;
  thead: number;
  row: number;
  continued: number;
  closing: number;
  /** Height of a "Balance Brought Forward" / "Total Carried Forward" ledger
   * row — 0 for templates that don't use the carry-forward feature (see
   * ProbeContent.carryRow below), in which case it's a no-op in the budget
   * math. Only the CLASSIC template supplies this today. */
  carryRow: number;
};

export type PageCapacities = { perPage: number; singleCap: number; lastCap: number };

/** The same "sum the fixed sections, subtract from usable, divide by row
 * height" arithmetic invoice-sheet-classic.tsx always used — now taking
 * measured pixel heights instead of hardcoded mm constants.
 *
 * Every non-last page always shows a "Total Carried Forward" row after its
 * items, and every page but the first shows a "Balance Brought Forward" row
 * before them (see InvoiceSheetClassic) — both budgeted here so a page's
 * item count leaves room for them instead of the row silently pushing the
 * page over its physical height. `perPage` reserves room for both (the
 * worst case, a middle continuation page that shows both rows) even though
 * page 1 only ever shows one of them — a page 1 very occasionally rendering
 * one row shorter than it strictly needed to is a far smaller cost than the
 * alternative of running long. */
export function computeCapacities(h: MeasuredHeights): PageCapacities {
  const perPage = Math.max(1, Math.floor((USABLE_PX - h.header - h.buyer - h.thead - h.continued - h.carryRow * 2) / h.row));
  const singleCap = Math.max(0, Math.floor((USABLE_PX - h.header - h.buyer - h.thead - h.closing - ENDBAND_PX) / h.row));
  const lastCap = Math.max(0, Math.floor((USABLE_PX - h.header - h.thead - h.closing - ENDBAND_PX - h.carryRow) / h.row));
  return { perPage, singleCap, lastCap };
}

export type ProbeContent = {
  header: ReactNode;
  buyer: ReactNode;
  /** The items table's `<thead>` content (just the header row(s)). */
  itemsTableHead: ReactNode;
  /** One representative `<tr>`'s content — used to measure a single row's
   * real height (font size, padding, borders all included). */
  itemRow: ReactNode;
  /** The "Continued on page N of M →" footer shown on non-last pages. */
  continuedFooter: ReactNode;
  /** The full closing block (totals, amount-in-words, optional sections,
   * signature) for THIS invoice — i.e. only whichever optional sections
   * (bank details, discount row, paid box, HSN table, "you saved", …)
   * this specific invoice actually renders. */
  closing: ReactNode;
  /** A representative "Balance Brought Forward"/"Total Carried Forward"
   * `<tr>` — omit entirely for templates without the carry-forward feature
   * (see MeasuredHeights.carryRow), which measures as 0 and is a no-op in
   * the capacity math. */
  carryRow?: ReactNode;
};

/** Mounts a hidden, off-screen probe of this invoice's real sections
 * (rendered with this invoice's actual data — real address, real notes,
 * whichever optional sections are actually on) and measures each one's
 * true rendered height once, on mount.
 *
 * Intended for the static print/PDF render path only (editable === false):
 * the invoice's content there is fixed for the life of the page (server-
 * fetched, not live-edited), so measuring once on mount — rather than on
 * every render — is both sufficient and necessary: re-running the
 * measurement effect on every render (e.g. by depending on the `content`
 * object, which is a fresh reference each render) would set new state
 * every render and never settle. */
export function useMeasuredSections(content: ProbeContent): { heights: MeasuredHeights | null; ready: boolean; probe: ReactNode } {
  const headerRef = useRef<HTMLDivElement>(null);
  const buyerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const continuedRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);
  const carryRowRef = useRef<HTMLTableRowElement>(null);
  const [heights, setHeights] = useState<MeasuredHeights | null>(null);
  // Distinct from `heights !== null` — see below. The PDF route should
  // only treat the layout as settled once `ready` is true.
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const measure = () =>
      setHeights({
        header: headerRef.current?.getBoundingClientRect().height ?? 0,
        buyer: buyerRef.current?.getBoundingClientRect().height ?? 0,
        thead: theadRef.current?.getBoundingClientRect().height ?? 0,
        row: rowRef.current?.getBoundingClientRect().height ?? 0,
        continued: continuedRef.current?.getBoundingClientRect().height ?? 0,
        closing: closingRef.current?.getBoundingClientRect().height ?? 0,
        carryRow: carryRowRef.current?.getBoundingClientRect().height ?? 0,
      });

    // Measure immediately — keeps a real (non-PDF) viewer's flash-of-
    // wrong-pagination window as short as possible. But `next/font`'s
    // self-hosted webfonts still land via `font-display: swap`: the very
    // first paint can use the browser's own fallback font, whose line
    // height/character widths don't perfectly match the real font despite
    // next/font's size-adjust metrics override, until the real font file
    // finishes loading and the browser swaps it in — a swap that can
    // easily land after this synchronous measurement already ran,
    // especially on a cold Playwright context with nothing cached. A
    // measurement taken against the fallback font's metrics can silently
    // under- or over-count how much content fits per page, which is
    // exactly the kind of mismatch that makes a physical page overflow
    // later. So this measures again once `document.fonts.ready` resolves
    // (real fonts guaranteed loaded and applied) and only *then* flips
    // `ready` — see the `data-pdf-ready` marker at each caller, which
    // gates on `ready`, not merely on `heights` being non-null.
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
    // Measure once on mount only — see the doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const probe = (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', visibility: 'hidden', top: 0, left: 0, width: '100%', zIndex: -1, pointerEvents: 'none' }}
    >
      <div ref={headerRef}>{content.header}</div>
      <div ref={buyerRef}>{content.buyer}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead ref={theadRef}>{content.itemsTableHead}</thead>
        <tbody>
          <tr ref={rowRef}>{content.itemRow}</tr>
        </tbody>
      </table>
      <div ref={continuedRef}>{content.continuedFooter}</div>
      <div ref={closingRef}>{content.closing}</div>
      {content.carryRow && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr ref={carryRowRef}>{content.carryRow}</tr>
          </tbody>
        </table>
      )}
    </div>
  );

  return { heights, ready, probe };
}
