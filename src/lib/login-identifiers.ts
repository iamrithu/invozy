// What a sign-in identifier is. Company logins sign in with an email or a
// phone, unique across the whole platform (sign-in doesn't ask which
// company). Keeping the two shapes strictly apart — an email always has an
// "@", a phone never does — means a value saved in one field can never match
// someone else's login in the other.

/** A phone after normalizePhone(): optional +, then 7–15 digits. */
export const PHONE_RE = /^\+?\d{7,15}$/;

/** "98400 12345", "98400-12345", "(984) 0012345" → "9840012345". */
export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s()-]/g, '');
}

export function isEmailIdentifier(value: string): boolean {
  return value.includes('@');
}

/** The platform admin's email (ADMIN_EMAIL) can't also be a company login —
 * it would share the admin's sign-in throttle and confuse who is who. */
export function isReservedLoginEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return !!admin && !!email && email.trim().toLowerCase() === admin;
}
