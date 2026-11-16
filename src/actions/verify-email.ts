'use server';

import { requireUser } from '@/lib/session';
import { sendVerificationEmail } from '@/lib/email-verification';
import { consumeRateLimit } from '@/lib/login-rate-limit';
import { toActionError, type ActionResult } from '@/lib/action-result';

/** "Resend the link" from the in-app banner — at most 3 an hour per login. */
export async function resendVerificationEmail(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.viewOnly) return { error: 'View only.' };
    if (!user.email) return { error: 'This login has no email address.' };
    if (user.emailVerifiedAt) return {};
    if (!(await consumeRateLimit(`verify:${user.id}`, 3, 60 * 60 * 1000))) return { error: 'We’ve sent a few already — check your spam folder, or try again in an hour.' };
    await sendVerificationEmail(user.id);
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
