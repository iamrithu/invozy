import { AsyncLocalStorage } from 'node:async_hooks';
import { cache } from 'react';

// Which company the current code is acting for. The scoped Prisma client
// (src/lib/prisma.ts → src/lib/tenant-scope.ts) asks this on every query, so
// app code never passes a companyId around. Three sources, in order:
//
//   1. runWithTenant(id, fn) — explicit, for code with no session: cron jobs
//      fanning out over companies, route handlers authorised by a signed
//      token, scripts and tests.
//   2. setRequestTenant(id) — for a Server Component page authorised by a
//      signed token (the /print/* pages the PDF renderer opens). React's
//      cache() makes it last for exactly that one request.
//   3. The signed-in user's session (its JWT carries companyId; requireUser()
//      in src/lib/session.ts checks it against the database).
//
// None of them → TenantMissingError. Nothing ever falls back to "all
// companies": platform-wide code (auth, /admin, cron fan-out) uses
// `rootPrisma` explicitly instead.

export class TenantMissingError extends Error {
  constructor() {
    super('No company in scope for this request. Sign in again.');
    this.name = 'TenantMissingError';
  }
}

const store = new AsyncLocalStorage<{ companyId: string }>();

/** Runs `fn` (and everything it awaits) as `companyId`. */
export function runWithTenant<T>(companyId: string, fn: () => T): T {
  if (!companyId) throw new TenantMissingError();
  return store.run({ companyId }, fn);
}

// One mutable box per request (React cache() is request-scoped in Server
// Components; elsewhere it doesn't memoise, so the box is simply empty).
const requestBox = cache((): { companyId: string | null } => ({ companyId: null }));

/** Scopes the rest of this Server Component request to `companyId` — call it
 * only after verifying the request may act for that company (a signed token
 * minted for one of its documents). */
export function setRequestTenant(companyId: string) {
  requestBox().companyId = companyId;
}

const sessionCompanyId = cache(async (): Promise<string | null> => {
  try {
    // Lazy: keeps next-auth out of scripts that only use runWithTenant, and
    // breaks the prisma → tenant-scope → tenant → auth → prisma import cycle.
    const { auth } = await import('@/auth');
    const session = await auth();
    return session?.user?.companyId ?? null;
  } catch {
    // auth() throws outside a request (scripts, tests) — no session there.
    return null;
  }
});

/** The company in scope, or null. */
export async function findCompanyId(): Promise<string | null> {
  const explicit = store.getStore()?.companyId;
  if (explicit) return explicit;
  try {
    const fromRequest = requestBox().companyId;
    if (fromRequest) return fromRequest;
  } catch {
    // cache() unavailable in this runtime — fall through.
  }
  return sessionCompanyId();
}

/** The company in scope; throws TenantMissingError when there is none. */
export async function currentCompanyId(): Promise<string> {
  const id = await findCompanyId();
  if (!id) throw new TenantMissingError();
  return id;
}
