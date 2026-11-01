import { PDF_PAGE } from '@/lib/pdf-browser';
import { PdfReadyMarker } from './pdf-ready-marker';

/** The page body of a /print/** document: white paper at exactly the A4
 * content width (src/lib/pdf-browser.ts PDF_PAGE), so it lays out at the
 * width it prints at. `print-doc` is the class globals.css keeps visible
 * (and gives repeating table headers) under print media — the same root
 * the invoice print page uses. Ends with the `data-pdf-ready` marker the
 * renderer waits for. */
export function PrintPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="print-doc mx-auto my-6 bg-white print:my-0" style={{ width: `${PDF_PAGE.contentWidthMm}mm` }}>
      {children}
      <PdfReadyMarker />
    </main>
  );
}
