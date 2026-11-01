import { cache } from 'react';
import { auth } from '@/auth';
import { prisma } from './prisma';

/** The auth gate every Server Action and protected page runs first. Server
 * Actions are public POST endpoints (callable from any page, including the
 * logged-out /login page), so each one must check the session itself rather
 * than relying on src/proxy.ts.
 *
 * A valid JWT alone isn't enough: any token signed with the same AUTH_SECRET
 * decrypts fine — e.g. one minted by another deployment sharing the secret,
 * or one for a user that no longer exists — so the user row is checked too.
 * It's a primary-key lookup, and cache() makes it once per request; the app
 * layout reuses its `onboardedAt` instead of querying again. A login the
 * owner has switched off (User.active) is treated as signed out. */
export const requireUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  const user = id
    ? await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, phone: true, name: true, role: true, active: true, onboardedAt: true },
      })
    : null;
  if (!user || !user.active) throw new Error('Not signed in.');
  return user;
});

/** Owner-only actions (deletes, company settings, managing logins) — staff
 * logins get a readable refusal instead of a silent failure. */
export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== 'OWNER') throw new Error('Only the owner can do this. Ask the owner to make this change.');
  return user;
}
