import crypto from 'node:crypto';
import { rootPrisma } from './prisma';
import { sendEmail } from './email';
import { APP_NAME } from './brand';
import { configuredSiteOrigin } from './site-origin';

// Proving a login controls its email address. Platform-level (rootPrisma):
// the link is opened from an inbox, often signed out. Sending never throws —
// a mail hiccup must not fail the signup or save that triggered it.

const TTL_MS = 48 * 60 * 60 * 1000;

async function siteOrigin(): Promise<string> {
  const configured = configuredSiteOrigin();
  if (configured) return configured;
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
  } catch {
    // outside a request
  }
  return 'http://localhost:3000';
}

export async function sendVerificationEmail(userId: string): Promise<void> {
  try {
    const user = await rootPrisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true, company: { select: { name: true } } } });
    if (!user?.email || user.emailVerifiedAt) return;
    const token = crypto.randomBytes(32).toString('hex');
    await rootPrisma.emailVerificationToken.create({ data: { token, userId, email: user.email, expiresAt: new Date(Date.now() + TTL_MS) } });
    const url = `${await siteOrigin()}/verify-email?token=${token}`;
    await sendEmail(
      user.email,
      `Confirm your email for ${APP_NAME}`,
      `<p>Confirm this is your email address for <b>${user.company.name}</b> on ${APP_NAME}.</p><p><a href="${url}">Confirm my email</a> — the link works for 48 hours.</p><p>If you didn't sign up, you can ignore this email.</p>`
    );
  } catch (e) {
    console.error('verification email failed', e);
  }
}

export type VerifyResult = 'verified' | 'already' | 'invalid' | 'expired';

/** Consumes a link's token. The address must still be the login's email —
 * a link sent before an email change confirms nothing. */
export async function verifyEmailToken(token: string): Promise<VerifyResult> {
  if (!/^[a-f0-9]{64}$/.test(token)) return 'invalid';
  const row = await rootPrisma.emailVerificationToken.findUnique({ where: { token }, include: { user: { select: { email: true, emailVerifiedAt: true } } } });
  if (!row || !row.user.email || row.user.email.toLowerCase() !== row.email.toLowerCase()) return 'invalid';
  if (row.usedAt) return row.user.emailVerifiedAt ? 'already' : 'invalid';
  if (row.expiresAt < new Date()) return 'expired';
  await rootPrisma.$transaction([
    rootPrisma.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    rootPrisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return 'verified';
}
