'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/** Marks the signed-in user as having seen the first-login tour, so it never
 * auto-starts again — "Replay tour" in the account menu still works
 * regardless, since that's driven by a separate client-side trigger. */
export async function completeOnboarding() {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.user.update({ where: { id: session.user.id }, data: { onboardedAt: new Date() } }).catch(() => {
    // best-effort — a failed write here shouldn't block the user from
    // dismissing the tour client-side
  });
}
