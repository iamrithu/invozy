import { createHmac, timingSafeEqual } from 'node:crypto';
import { currentCompanyId } from './tenant';

// Short HMAC-signed tokens for URLs that must work without a session:
// the headless PDF renderer loading a print page (minutes-long expiry), and
// the public invoice link sent to a customer on WhatsApp (long expiry).
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256). Signed
// with AUTH_SECRET, so rotating that secret revokes every outstanding link.
//
// Every token also names the company it was minted for (`c`) — the company
// in scope when it was created — and whoever verifies it acts for that
// company only (src/lib/signed-request.ts). A token can never widen access
// beyond the one document of the one company it was made for.

type Payload = { k: string; id: string; c: string; exp: number };

export type VerifiedToken = { id: string; companyId: string };

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set.');
  return s;
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

/** `kind` scopes a token to one use ("print-invoice", "share-invoice"…) so a
 * token minted for one purpose can't be replayed against another route. */
export async function createSignedToken(kind: string, id: string, ttlSeconds: number): Promise<string> {
  const payload: Payload = { k: kind, id, c: await currentCompanyId(), exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** The id (and company) the token was minted for, or null if it's
 * malformed, tampered with, expired, or for a different `kind`. Doesn't check
 * the company is still active — use src/lib/signed-request.ts for that. */
export function verifySignedToken(kind: string, token: string | null | undefined): VerifiedToken | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload;
    if (payload.k !== kind || payload.exp < Math.floor(Date.now() / 1000) || !payload.c || !payload.id) return null;
    return { id: payload.id, companyId: payload.c };
  } catch {
    return null;
  }
}

/** Public link a customer can open without signing in — streams that
 * invoice's PDF (src/app/api/share/[token]/route.ts). Valid for 180 days. */
export function invoiceShareToken(invoiceId: string): Promise<string> {
  return createSignedToken('share-invoice', invoiceId, 180 * 24 * 3600);
}
