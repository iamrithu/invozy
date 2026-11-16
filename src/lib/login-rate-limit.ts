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

export async function recordFailedLogin(identifier: string, kind: LoginKind = 'company', max = MAX_ATTEMPTS) {
  const key = lockoutKey(identifier, kind);
  if (!key) return;
  const row = await prisma.loginAttempt.upsert({
    where: { identifier: key },
    create: { identifier: key, failCount: 1 },
    update: { failCount: { increment: 1 } },
  });
  if (row.failCount >= max) {
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

/** A simple fixed-window counter on the same table, for things that aren't
 * passwords: signups per IP, verification-email resends… Returns false once
 * `max` hits have been used in the current `windowMs`. Keys are namespaced
 * by the caller ("signup-ip:…", "verify:…") so they never collide with the
 * login counters above. */
export async function consumeRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  if (!key) return true;
  if ((await windowCount(key, windowMs)) >= max) return false;
  await bumpWindow(key, windowMs);
  return true;
}

/** Hits recorded on `key` in the current window (0 once it's lapsed). */
export async function windowCount(key: string, windowMs: number): Promise<number> {
  if (!key) return 0;
  const row = await prisma.loginAttempt.findUnique({ where: { identifier: key } });
  return !row || Date.now() - row.updatedAt.getTime() > windowMs ? 0 : row.failCount;
}

/** Records one hit on `key`, starting a new window if the last one lapsed. */
export async function bumpWindow(key: string, windowMs: number): Promise<void> {
  if (!key) return;
  const row = await prisma.loginAttempt.findUnique({ where: { identifier: key } });
  if (!row || Date.now() - row.updatedAt.getTime() > windowMs) {
    await prisma.loginAttempt.upsert({ where: { identifier: key }, create: { identifier: key, failCount: 1 }, update: { failCount: 1, lockedUntil: null } });
  } else {
    await prisma.loginAttempt.update({ where: { identifier: key }, data: { failCount: { increment: 1 } } });
  }
}

/** Wrong passwords from one network, across every login: a separate window
 * so credential-stuffing from one IP is cut off even when it spreads its
 * guesses over many accounts. Never cleared by a successful sign-in (an
 * attacker with one real account could otherwise reset it). */
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const ipKey = (kind: LoginKind, ip: string) => (ip ? `${kind}-ip:${ip}` : '');
