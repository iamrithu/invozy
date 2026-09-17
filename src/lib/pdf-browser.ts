import type { Browser } from 'playwright-core';

/** A single headless Chromium instance, shared across every PDF-download
 * request in this Node process — launching a browser takes ~1s, so reusing
 * one (rather than launch/close per request) keeps repeat downloads fast.
 * Lazily started on first use; there's nothing to pre-warm at build time.
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
 *   its `executablePath`. */
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
    return getSharedBrowser();
  }
  return browser;
}
