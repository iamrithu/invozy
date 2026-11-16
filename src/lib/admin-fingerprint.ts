import { createHash } from 'node:crypto';

/** A short hash of the current platform-admin credentials (ADMIN_EMAIL +
 * ADMIN_PASSWORD_HASH). Stamped into the admin's session at sign-in and
 * compared on every admin request, so rotating either variable signs the
 * admin out everywhere — without having to rotate AUTH_SECRET (which would
 * also sign out every company and revoke every shared invoice link). */
export function adminFingerprint(): string {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const hash = process.env.ADMIN_PASSWORD_HASH?.replace(/\\\$/g, '$') ?? '';
  return createHash('sha256').update(`${email}\n${hash}`).digest('base64url').slice(0, 16);
}
