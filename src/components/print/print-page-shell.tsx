import { getAppSettings } from '@/lib/settings';
import { contentWidthMm, pageMarginCss } from '@/lib/pdf-layout';
import { PdfReadyMarker } from './pdf-ready-marker';

/** The page body of a /print/** document: white paper at exactly the A4
 * content width the company's PDF margins leave (Company → PDF layout,
 * src/lib/pdf-layout.ts), so it lays out at the width it prints at; the
 * same margins go to the browser's own Print via @page. `print-doc` is the
 * class globals.css keeps visible (and gives repeating table headers) under
 * print media — the same root the invoice print page uses. Ends with the
 * `data-pdf-ready` marker the renderer waits for. */
export async function PrintPageShell({ children }: { children: React.ReactNode }) {
  const { pdfLayout } = await getAppSettings();
  return (
    <main className="print-doc mx-auto my-6 bg-white print:my-0" style={{ width: `${contentWidthMm(pdfLayout)}mm` }}>
      <style>{pageMarginCss(pdfLayout)}</style>
      {children}
      <PdfReadyMarker />
    </main>
  );
}
