/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, too small for a product/company image upload (up to
      // 6 photos per product, each capped at 4MB in src/lib/uploads.ts).
      bodySizeLimit: '10mb',
    },
  },
  // Vercel's build only bundles files it can trace a static require()/import
  // to. playwright-core's coreBundle.js resolves browsers.json (and a few
  // other data files) at runtime via a dynamic path lookup, not a literal
  // require, so the tracer misses it — the deployed function then throws
  // "Cannot find module '/var/task/node_modules/playwright-core/browsers.json'"
  // the moment src/lib/pdf-browser.ts's serverless branch (@sparticuz/chromium
  // + playwright-core) tries to launch a browser. Forcing the whole package
  // (plus @sparticuz/chromium's own bundled binary, same class of issue) into
  // the trace for just this one route fixes it without pulling either into
  // every other route's bundle.
  outputFileTracingIncludes: {
    '/api/invoices/[id]/pdf': ['./node_modules/playwright-core/**/*', './node_modules/@sparticuz/chromium/**/*'],
  },
};

module.exports = nextConfig;
