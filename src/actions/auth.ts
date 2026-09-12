'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { currentIndianFY } from '@/lib/gst';
import { sendEmail } from '@/lib/email';
import { clearFailedLogins } from '@/lib/login-rate-limit';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const SignUpSchema = z
  .object({
    companyName: z.string().min(1, 'Company name is required'),
    state: z.string().min(1, 'State is required'),
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    phone: z.string().min(7, 'Enter a valid phone number').optional().or(z.literal('')),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Provide an email or phone number',
    path: ['email'],
  });

export type SignUpFormState = { error?: string; fieldErrors?: Record<string, string>; identifier?: string };

export async function signUp(_prev: SignUpFormState, formData: FormData): Promise<SignUpFormState> {
  const parsed = SignUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const { companyName, state, password } = parsed.data;
  const email = parsed.data.email || null;
  const phone = parsed.data.phone || null;

  const existing = await prisma.user.findFirst({
    where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
  });
  if (existing) {
    return { error: 'An account with that email or phone already exists.', fieldErrors: { email: 'Already in use' } };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    // Company.email always mirrors the owner's login email (see
    // src/actions/company.ts) — there's exactly one user per company, so
    // keeping them in lockstep avoids two independently-editable fields
    // drifting apart.
    const company = await tx.company.create({
      data: { name: companyName, state, email, invoiceFY: currentIndianFY() },
    });
    await tx.user.create({
      data: { email, phone, passwordHash, companyId: company.id, role: 'OWNER' },
    });
  });

  return { identifier: email ?? phone ?? undefined };
}

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
  const user = await prisma.user.findFirst({ where: { role: 'OWNER', OR: [{ email: identifier }, { phone: identifier }] } });
  if (!user || !user.email) return { message };

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const origin = await currentOrigin();
  const resetUrl = `${origin}/reset-password?token=${token}`;
  await sendEmail(
    user.email,
    'Reset your Invozy password',
    `<p>Someone requested a password reset for your Invozy account.</p><p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in an hour.</p><p>If this wasn't you, you can ignore this email.</p>`
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
