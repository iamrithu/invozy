import type { MetadataRoute } from 'next';

/** Makes Invozy installable ("Add to Home screen") so it opens like an app on
 * the phone used for billing — see the Next.js PWA guide
 * (node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md).
 * Served at /manifest.webmanifest, which src/proxy.ts doesn't match, so the
 * browser can fetch it without a session.
 *
 * Deliberately no service worker: a manifest + HTTPS is all installing
 * needs, and a worker that cached pages could show yesterday's balances or
 * stock as if they were current — on a billing app that's worse than
 * showing nothing while offline.
 *
 * Icons in public/icons/ are rendered from public/brand/mark.png. The
 * maskable ones are full-bleed white with the mark inside the central safe
 * zone, so Android's circle/squircle crop never clips it. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Invozy — GST billing',
    short_name: 'Invozy',
    description: 'GST billing, payments, stock and returns for your business.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#E23645',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the home-screen icon to jump straight into a bill.
    shortcuts: [
      { name: 'New invoice', short_name: 'New bill', url: '/invoices/new', icons: [{ src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Invoices', url: '/invoices', icons: [{ src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  };
}
