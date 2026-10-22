'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';

/** Marks the signed-in user as having seen the first-login tour, so it never
 * auto-starts again — "Replay tour" in the account menu still works
 * regardless, since that's driven by a separate client-side trigger. */
export async function completeOnboarding() {
  const user = await requireUser().catch(() => null);
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } }).catch(() => {
    // best-effort — a failed write here shouldn't block the user from
    // dismissing the tour client-side
  });
}
