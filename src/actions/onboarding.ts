'use server';

import { prisma } from '@/lib/prisma';
import { requireOwner, requireUser } from '@/lib/session';
import { getChecklistState, setChecklistState } from '@/lib/settings';
import { toActionError } from '@/lib/action-result';

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

const MARKABLE = new Set(['gstin', 'logo', 'design', 'team']);

/** Hides the dashboard setup checklist for good (owner only). */
export async function dismissSetupChecklist(): Promise<{ error?: string }> {
  try {
    await requireOwner();
    const state = await getChecklistState();
    await setChecklistState({ ...state, dismissed: true });
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

/** Ticks an item that can't be detected from data — "not GST-registered",
 * "happy with the default design"… */
export async function markSetupItem(key: string): Promise<{ error?: string }> {
  try {
    await requireOwner();
    if (!MARKABLE.has(key)) return { error: 'That step can’t be ticked by hand.' };
    const state = await getChecklistState();
    await setChecklistState({ ...state, marked: [...state.marked, key] });
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
