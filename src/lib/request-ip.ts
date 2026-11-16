/** The client's IP for throttling and the audit log. On Vercel the first
 * x-forwarded-for entry is the client (Vercel sets the header itself); self-
 * hosted, put the app behind a proxy that does the same. '' when unknown. */
export function ipFromHeaders(h: Headers): string {
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (forwarded || h.get('x-real-ip') || '').slice(0, 64);
}

export async function requestIp(): Promise<string> {
  try {
    const { headers } = await import('next/headers');
    return ipFromHeaders(await headers());
  } catch {
    return '';
  }
}
