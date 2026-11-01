import type { Browser, BrowserContext } from 'playwright-core';

/** The one physical page every PDF prints to — A4 with these margins. The
 * print pages (src/app/print/**) lay their content out at exactly
 * CONTENT_WIDTH_MM, and the invoice sheets' pagination budget
 * (print-pagination.tsx's USABLE_MM) is derived from the same 297mm −
 * top − bottom height, so what gets measured on screen is what prints.
 * Kept here (server-only) rather than in print-pagination.tsx because that
 * file is a Client Component module: a server import from it would get a
 * client reference instead of these numbers. */
export const PDF_PAGE = {
  format: 'A4' as const,
  margin: { top: 14, bottom: 14, left: 12, right: 12 },
  /** 210mm − 12mm − 12mm. */
  contentWidthMm: 186,
};

/** CSS px at 96dpi — the A4 content width as a viewport width, so the
 * headless page lays out at the same width it prints at. */
export const PDF_VIEWPORT = { width: Math.round((PDF_PAGE.contentWidthMm * 96) / 25.4), height: 1000 };

/** A single headless Chromium instance, shared across every PDF render in
 * this Node process — launching a browser takes ~1s, so reusing one
 * (rather than launch/close per request) keeps repeat renders fast. Lazily
 * started on first use; there's nothing to pre-warm at build time.
 *
 * Two different Chromiums, by environment:
 * - Locally (`next dev`), the full `playwright` package's own downloaded
 *   browser (via its `postinstall`) is used — simplest for development.
 * - On Vercel (or any serverless host), that downloaded browser never makes
 *   it into the deployed function — only files inside node_modules get
 *   traced into the bundle, and Playwright's browser cache lives outside
 *   node_modules entirely, so `chromium.launch()` failed with "Executable
 *   doesn't exist" in production (this is what broke the PDF preview/
 *   download on the live site). `@sparticuz/chromium` ships its Chromium
 *   binary inside the npm package itself, so it *is* traced and bundled —
 *   `playwright-core` (no bundled browser of its own) just drives it via
 *   its `executablePath`. That tracing is configured per route in
 *   next.config.js (outputFileTracingIncludes), which is why every render
 *   goes through /api/invoices/[id]/pdf — see src/lib/invoice-pdf.ts. */
async function launch(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    const [{ default: sparticuzChromium }, { chromium }] = await Promise.all([import('@sparticuz/chromium'), import('playwright-core')]);
    return chromium.launch({
      args: sparticuzChromium.args,
      executablePath: await sparticuzChromium.executablePath(),
      headless: true,
    });
  }
  const { chromium } = await import('playwright');
  return chromium.launch({ args: ['--no-sandbox'] });
}

let browserPromise: Promise<Browser> | null = null;

export async function getSharedBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().catch((e) => {
      browserPromise = null; // let the next request retry instead of caching a rejected launch forever
      throw e;
    });
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    contextPromise = null;
    return getSharedBrowser();
  }
  return browser;
}

let contextPromise: Promise<BrowserContext> | null = null;

/** One reusable browser context for every render — creating a context per
 * request was a measurable chunk of each render. Safe to share because the
 * print pages authenticate with a signed `?t=` token in the URL, not a
 * cookie, so no session ever lives in this context. The viewport is the A4
 * content width (PDF_VIEWPORT) so the sheet's self-measuring pagination
 * sees the same line wrapping the printed page will have. Callers open a
 * page, render, and close the page — never the context. */
export async function getSharedPdfContext(): Promise<BrowserContext> {
  const browser = await getSharedBrowser();
  if (!contextPromise) {
    contextPromise = browser
      .newContext({ viewport: PDF_VIEWPORT, deviceScaleFactor: 1 })
      .then((context) => {
        context.on('close', () => {
          contextPromise = null;
        });
        return context;
      })
      .catch((e) => {
        contextPromise = null;
        throw e;
      });
  }
  return contextPromise;
}
