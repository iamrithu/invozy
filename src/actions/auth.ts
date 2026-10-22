'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { clearFailedLogins } from '@/lib/login-rate-limit';
import { APP_NAME } from '@/lib/brand';

// No signUp here on purpose — this deployment serves one company, and its
// logins are created only by `npm run setup` (scripts/setup-company.ts).

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

async function currentOrigin() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host');
  return `${proto}://${host}`;
}

const RequestResetSchema = z.string().min(1);

/** Always returns the same generic message regardless of whether the
 * identifier matches an account — otherwise this endpoint could be used to
 * enumerate registered emails/phones. */
export async function requestPasswordReset(_prev: unknown, formData: FormData) {
  const parsed = RequestResetSchema.safeParse(formData.get('identifier'));
  const identifier = parsed.success ? parsed.data.trim() : '';
  const message = "If an account matches that email or phone, we've sent a reset link.";

  if (!identifier) return { message };

  // Reset links are emailed — a phone-only account (no SMS integration yet)
  // can't be self-served here, so it falls through to the same generic
  // message as "no account found" rather than a confusing dead end.
  const user = await prisma.user.findFirst({ where: { OR: [{ email: { equals: identifier, mode: 'insensitive' } }, { phone: identifier }] } });
  if (!user || !user.email) return { message };

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const origin = await currentOrigin();
  const resetUrl = `${origin}/reset-password?token=${token}`;
  await sendEmail(
    user.email,
    `Reset your ${APP_NAME} password`,
    `<p>Someone requested a password reset for your ${APP_NAME} account.</p><p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in an hour.</p><p>If this wasn't you, you can ignore this email.</p>`
  );

  return { message };
}

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type ResetPasswordFormState = { error?: string; success?: boolean };

export async function resetPassword(_prev: ResetPasswordFormState, formData: FormData): Promise<ResetPasswordFormState> {
  const parsed = ResetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token: parsed.data.token }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: 'This reset link is invalid or has expired. Request a new one.' };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  if (record.user.email) await clearFailedLogins(record.user.email);

  return { success: true };
}
