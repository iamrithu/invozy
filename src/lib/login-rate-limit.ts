import { prisma } from '@/lib/prisma';

// Locks an identifier (login email/phone) out for a cooldown after too many
// wrong passwords in a row, so credentials can't be brute-forced — applies
// to both the tenant login and the fixed super-admin account.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function assertNotLockedOut(identifier: string) {
  const key = identifier.trim().toLowerCase();
  if (!key) return;
  const row = await prisma.loginAttempt.findUnique({ where: { identifier: key } });
  if (row?.lockedUntil && row.lockedUntil > new Date()) {
    const minutes = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60000);
    throw new Error(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

export async function recordFailedLogin(identifier: string) {
  const key = identifier.trim().toLowerCase();
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

export async function clearFailedLogins(identifier: string) {
  const key = identifier.trim().toLowerCase();
  if (!key) return;
  await prisma.loginAttempt.deleteMany({ where: { identifier: key } });
}
