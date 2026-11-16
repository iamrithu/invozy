import { prisma } from '@/lib/prisma';
import { isEmailIdentifier, normalizePhone } from './login-identifiers';

// Locks a login out for a cooldown after too many wrong passwords in a row,
// so credentials can't be brute-forced.
//
// One counter per *login*, however it's typed: emails are lowercased and
// phones have their spacing stripped, the same way sign-in matches them —
// otherwise "98400 12345", "98400-12345"… would each get their own five
// tries at the same account. The platform admin's counter lives in its own
// namespace, so nothing a company login does (signing in, a password reset
// clearing its lockout) can ever touch the admin's.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export type LoginKind = 'company' | 'admin';

export function lockoutKey(identifier: string, kind: LoginKind = 'company'): string {
  const value = identifier.trim().toLowerCase();
  if (!value) return '';
  const login = isEmailIdentifier(value) ? value : normalizePhone(value);
  return kind === 'admin' ? `admin:${login}` : login;
}

export async function assertNotLockedOut(identifier: string, kind: LoginKind = 'company') {
  const key = lockoutKey(identifier, kind);
  if (!key) return;
  const row = await prisma.loginAttempt.findUnique({ where: { identifier: key } });
  if (row?.lockedUntil && row.lockedUntil > new Date()) {
    const minutes = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60000);
    throw new Error(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

export async function recordFailedLogin(identifier: string, kind: LoginKind = 'company') {
  const key = lockoutKey(identifier, kind);
  if (!key) return;
  const row = await prisma.loginAttempt.upsert({
    where: { identifier: key },
    create: { identifier: key, failCount: 1 },
    update: { failCount: { increment: 1 } },
  });
  if (row.failCount >= MAX_ATTEMPTS) {
    await prisma.loginAttempt.update({
      where: { identifier: key },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
    });
  }
}

/** Clears company-login counters (never the admin's). */
export async function clearFailedLogins(...identifiers: (string | null | undefined)[]) {
  const keys = identifiers.filter((v): v is string => !!v).map((v) => lockoutKey(v)).filter(Boolean);
  if (keys.length) await prisma.loginAttempt.deleteMany({ where: { identifier: { in: keys } } });
}

export async function clearAdminFailedLogins(email: string) {
  const key = lockoutKey(email, 'admin');
  if (key) await prisma.loginAttempt.deleteMany({ where: { identifier: key } });
}
