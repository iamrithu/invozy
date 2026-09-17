import { chromium, type Browser } from 'playwright';

/** A single headless Chromium instance, shared across every PDF-download
 * request in this Node process — launching a browser takes ~1s, so reusing
 * one (rather than launch/close per request) keeps repeat downloads fast.
 * Lazily started on first use; there's nothing to pre-warm at build time. */
let browserPromise: Promise<Browser> | null = null;

export async function getSharedBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ args: ['--no-sandbox'] }).catch((e) => {
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
