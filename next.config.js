/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, too small for a product/customer/company image
      // upload: up to 6 photos per product or customer, each capped at 4MB
      // in src/lib/uploads.ts, plus multipart overhead. (The photo picker
      // also shrinks large camera photos before upload, so real requests
      // are usually far smaller than this.)
      bodySizeLimit: '25mb',
    },
    // src/proxy.ts runs on /products and /customers, and a proxy buffers
    // the request body up to this limit (default 10mb) — anything beyond it
    // is silently cut off before the server action sees it, so it has to
    // be at least the server-action limit above.
    proxyClientMaxBodySize: '25mb',
  },
  // Vercel's build only bundles files it can trace a static require()/import
  // to. playwright-core's coreBundle.js resolves browsers.json via a
  // *computed* require(path.join(runtimeVar, 'browsers.json')) — not a
  // literal string — so the tracer's static analysis can't follow it, and
  // the deployed function throws "Cannot find module
  // '/var/task/node_modules/playwright-core/browsers.json'" the moment
  // src/lib/pdf-browser.ts's serverless branch (@sparticuz/chromium +
  // playwright-core) even imports the package (this happens at import time,
  // before any browser is launched — confirmed locally by hiding the file
  // and reproducing the exact same error from a bare `require('playwright-core')`).
  //
  // IMPORTANT: the route key below is NOT a real glob against the live
  // request URL — Next's docs sample `/products/[id]` verbatim as a key, but
  // empirically (verified with real local production builds, inspecting the
  // resulting .next/server/**/*.nft.json) that literal `[id]` bracket form
  // never matches this dynamic route at all — `outputFileTracingIncludes`
  // silently does nothing. `*` in that same position does. Do not "fix" this
  // back to `[id]` bracket notation without re-verifying against a real
  // build's .nft.json — it looks more idiomatic but is actually broken.
  // Every route that renders a PDF in headless Chromium needs the same
  // three entries — invoices, credit notes, receipts, statements, the
  // loading sheet, the monthly report, the cron warm-up and the daily
  // summary (which attaches the monthly report on the 1st).
  outputFileTracingIncludes: Object.fromEntries(
    [
      '/api/invoices/*/pdf',
      '/api/pdf/credit-notes/*',
      '/api/pdf/receipts/*',
      '/api/pdf/statements/*',
      '/api/pdf/loading-sheet',
      '/api/pdf/monthly-report',
      '/api/cron/warm',
      '/api/cron/daily',
    ].map((route) => [
      route,
      ['./node_modules/playwright-core/**/*', './node_modules/playwright-core/browsers.json', './node_modules/@sparticuz/chromium/**/*'],
    ])
  ),
};

module.exports = nextConfig;
