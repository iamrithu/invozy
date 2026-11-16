import { rootPrisma } from './prisma';
import { adminFingerprint } from './admin-fingerprint';
import { createSignedToken, verifySignedToken } from './signed-token';
import { runWithTenant } from './tenant';

// "View as company" for platform support: the admin opens a company's
// workspace READ-ONLY. A short-lived signed cookie names the company and is
// bound to the current admin credentials; while it's valid, the admin's
// requests act for that company (src/lib/tenant.ts) as a synthetic owner
// (src/lib/session.ts), and the scoped Prisma client refuses every write
// (src/lib/tenant-scope.ts). Every start/stop is in the platform audit log.

export { VIEW_AS_COOKIE } from './view-as-cookie';
import { VIEW_AS_COOKIE } from './view-as-cookie';
export const VIEW_AS_TTL_S = 30 * 60;
/** The id requireUser() reports while viewing — never a real User row. */
export const VIEW_AS_USER_ID = 'platform-admin-view';

export async function mintViewAsToken(companyId: string): Promise<string> {
  // The token's id is the admin-credential fingerprint, so rotating the admin
  // credentials also ends any view session.
  return runWithTenant(companyId, () => createSignedToken('view-as', adminFingerprint(), VIEW_AS_TTL_S));
}

/** The company the signed-in admin is viewing, or null. Callers must have
 * already established that the session is the platform admin's. */
export async function readViewAs(): Promise<{ companyId: string } | null> {
  let raw: string | undefined;
  try {
    const { cookies } = await import('next/headers');
    raw = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  } catch {
    return null; // outside a request
  }
  const verified = verifySignedToken('view-as', raw);
  if (!verified || verified.id !== adminFingerprint()) return null;
  const exists = await rootPrisma.company.findUnique({ where: { id: verified.companyId }, select: { id: true } });
  return exists ? { companyId: verified.companyId } : null;
}
