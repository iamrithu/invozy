/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default is 1mb, too small for a product/company image upload (up to
      // 6 photos per product, each capped at 4MB in src/lib/uploads.ts).
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;
