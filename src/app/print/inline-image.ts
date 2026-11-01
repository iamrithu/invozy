import fs from 'node:fs/promises';
import path from 'node:path';

// Print pages hand the headless renderer one self-contained document: every
// image (company logo, signature) is inlined as a data URL here, server-side,
// so the render never waits on — or silently loses — an image fetch from
// Blob storage while Chromium is laying out the page.

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};
const PUBLIC_DIR = path.join(process.cwd(), 'public');

// Uploaded images get a fresh random URL on every upload (src/lib/uploads.ts),
// so a URL's bytes never change — safe to keep per process.
const cache = new Map<string, Promise<string | null>>();

/** `url` as a `data:` URL, or null when there's no image or it can't be
 * read (the sheets already render fine without a logo/signature). Never
 * throws. */
export function inlineImage(url: string | null | undefined): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  if (url.startsWith('data:')) return Promise.resolve(url);
  let hit = cache.get(url);
  if (!hit) {
    if (cache.size > 50) cache.clear();
    hit = load(url).then(
      (v) => {
        if (!v) cache.delete(url); // don't remember a miss — try again next time
        return v;
      },
      (e) => {
        console.error(`inlineImage: could not read ${url}`, e);
        cache.delete(url);
        return null;
      }
    );
    cache.set(url, hit);
  }
  return hit;
}

async function load(url: string): Promise<string | null> {
  // Local-disk uploads in dev (/uploads/...) and anything else under public/.
  if (url.startsWith('/')) {
    const file = path.join(PUBLIC_DIR, decodeURIComponent(url.split('?')[0]));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return null; // path traversal guard — the URL comes from DB data
    const buf = await fs.readFile(file);
    return `data:${MIME[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream'};base64,${buf.toString('base64')}`;
  }
  if (!/^https?:\/\//i.test(url)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) return null;
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
  const type = res.headers.get('content-type')?.split(';')[0].trim() || MIME[ext] || '';
  if (!type.startsWith('image/')) return null;
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}
