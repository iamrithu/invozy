import { rootPrisma } from './prisma';
import { verifySignedToken, type VerifiedToken } from './signed-token';
import { runWithTenant, setRequestTenant } from './tenant';

// Requests authorised by a signed token instead of a session — the /print/*
// pages the headless PDF renderer opens, the renderer's own build route, and
// the public invoice link. The token names its company; these helpers refuse
// it if that company has been suspended, then scope the request to it.

async function companyIsActive(companyId: string): Promise<boolean> {
  const company = await rootPrisma.company.findUnique({ where: { id: companyId }, select: { active: true } });
  return !!company?.active;
}

/** Verifies `token` and its company; null when either fails. */
export async function verifySignedRequest(kind: string, token: string | null | undefined): Promise<VerifiedToken | null> {
  const verified = verifySignedToken(kind, token);
  if (!verified) return null;
  return (await companyIsActive(verified.companyId)) ? verified : null;
}

/** For a /print/* Server Component page: true when `token` was minted for
 * exactly `expectedId`, in which case the rest of this request acts for the
 * token's company. */
export async function authorizeSignedPage(kind: string, token: string | null | undefined, expectedId: string): Promise<boolean> {
  const verified = await verifySignedRequest(kind, token);
  if (!verified || verified.id !== expectedId) return false;
  setRequestTenant(verified.companyId);
  return true;
}

/** For a route handler: runs `fn` as the token's company, or returns null
 * when the token is invalid, for another id, or its company is suspended. */
export async function withSignedTenant<T>(kind: string, token: string | null | undefined, expectedId: string | null, fn: (verified: VerifiedToken) => Promise<T>): Promise<T | null> {
  const verified = await verifySignedRequest(kind, token);
  if (!verified || (expectedId !== null && verified.id !== expectedId)) return null;
  return runWithTenant(verified.companyId, () => fn(verified));
}
