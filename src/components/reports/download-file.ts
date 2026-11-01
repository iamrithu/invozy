/** Downloads a file from one of our own GET routes (exports, backup, PDFs)
 * through fetch rather than a bare link, so a refusal ("Only the owner can
 * do this", an expired session, a failed render) shows up as a readable
 * toast instead of navigating the tab to a raw JSON error. The name comes
 * from the response's Content-Disposition, `fallbackName` only if absent.
 * Throws an Error with the server's message on failure. */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    let message = 'Download failed. Please try again.';
    try {
      const body = await res.json();
      if (body?.error) message = String(body.error);
    } catch {
      // not JSON — keep the generic message
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileNameFrom(res.headers.get('content-disposition')) ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

function fileNameFrom(disposition: string | null): string | null {
  if (!disposition) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : null;
}

/** `?from=…&to=…` for the given range, empty for all time. */
export function rangeQuery(range: { from?: string; to?: string }, extra?: Record<string, string>): string {
  const q = new URLSearchParams();
  if (range.from) q.set('from', range.from);
  if (range.to) q.set('to', range.to);
  for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}
