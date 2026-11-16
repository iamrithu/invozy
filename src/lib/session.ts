import { cache } from 'react';
import { auth } from '@/auth';
import { rootPrisma } from './prisma';
import { adminFingerprint } from './admin-fingerprint';
import { readViewAs, VIEW_AS_USER_ID } from './view-as';

/** The auth gate every Server Action and protected page runs first. Server
 * Actions are public POST endpoints (callable from any page, including the
 * logged-out /login page), so each one must check the session itself rather
 * than relying on src/proxy.ts.
 *
 * A valid JWT alone isn't enough: any token signed with the same AUTH_SECRET
 * decrypts fine — e.g. one minted by another deployment sharing the secret,
 * or one for a user that no longer exists — so the user row is checked too,
 * including that it still belongs to the company the token names (the
 * scoped Prisma client trusts the token's companyId). It's a primary-key
 * lookup, and cache() makes it once per request; the app layout reuses its
 * `onboardedAt` instead of querying again. A login the owner has switched
 * off (User.active), or one whose company the platform admin suspended, is
 * treated as signed out. */
export type SessionUser = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: 'OWNER' | 'STAFF';
  active: boolean;
  onboardedAt: Date | null;
  companyId: string;
  emailVerifiedAt: Date | null;
  /** The platform admin viewing this company read-only (src/lib/view-as.ts). */
  viewOnly: boolean;
};

export const requireUser = cache(async (): Promise<SessionUser> => {
  const session = await auth();
  if (session?.user?.role === 'SUPER_ADMIN') {
    // The platform admin has no company of its own; while "viewing as" one
    // it gets a synthetic, read-only owner — every write is refused by the
    // scoped client (src/lib/tenant-scope.ts).
    if (session.user.adminFp !== adminFingerprint()) throw new Error('Not signed in.');
    const view = await readViewAs();
    if (!view) throw new Error('Not signed in.');
    return {
      id: VIEW_AS_USER_ID,
      email: session.user.email ?? null,
      phone: null,
      name: 'Platform admin (view only)',
      role: 'OWNER',
      active: true,
      onboardedAt: new Date(0),
      companyId: view.companyId,
      emailVerifiedAt: new Date(0),
      viewOnly: true,
    };
  }
  const id = session?.user?.id;
  const user =
    id && session.user.companyId
      ? await rootPrisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            phone: true,
            name: true,
            role: true,
            active: true,
            onboardedAt: true,
            companyId: true,
            emailVerifiedAt: true,
            company: { select: { active: true } },
          },
        })
      : null;
  if (!user || !user.active || user.companyId !== session?.user?.companyId) throw new Error('Not signed in.');
  if (!user.company.active) throw new Error('This company account is suspended. Contact support.');
  const { company: _company, ...rest } = user;
  return { ...rest, viewOnly: false };
});

/** Owner-only actions (deletes, company settings, managing logins) — staff
 * logins get a readable refusal instead of a silent failure. */
export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== 'OWNER') throw new Error('Only the owner can do this. Ask the owner to make this change.');
  return user;
}

/** The platform admin (/admin). Every admin action re-checks this itself —
 * the proxy is a convenience, not the boundary. The session must also have
 * been issued for the *current* admin credentials (src/lib/admin-fingerprint.ts),
 * so rotating ADMIN_EMAIL / ADMIN_PASSWORD_HASH ends old admin sessions. */
export async function requireSuperAdmin() {
  const session = await auth();
  const user = session?.user;
  if (!user || user.role !== 'SUPER_ADMIN' || user.id !== 'super-admin' || !process.env.ADMIN_PASSWORD_HASH || user.adminFp !== adminFingerprint()) {
    throw new Error('Not authorized.');
  }
  return user;
}
