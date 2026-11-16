'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { rootPrisma } from '@/lib/prisma';
import { currentIndianFY } from '@/lib/gst';
import { isEmailIdentifier, isReservedLoginEmail, normalizePhone, PHONE_RE } from '@/lib/login-identifiers';
import { sendEmail } from '@/lib/email';
import { clearFailedLogins } from '@/lib/login-rate-limit';
import { APP_NAME } from '@/lib/brand';
import { configuredSiteOrigin } from '@/lib/site-origin';
import { addDays } from 'date-fns';
import { TRIAL_DAYS } from '@/lib/plans';
import { requestIp } from '@/lib/request-ip';
import { consumeRateLimit } from '@/lib/login-rate-limit';
import { sendVerificationEmail } from '@/lib/email-verification';

// Everything here runs before anyone is signed in to a company, so it uses
// the unscoped `rootPrisma` — and only ever touches the one login (or the one
// new company) the request is about.

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const SignUpSchema = z
  .object({
    companyName: z.string().trim().min(1, 'Company name is required').max(120),
    state: z.string().min(1, 'State is required'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email')
      .refine((v) => !isReservedLoginEmail(v), 'This email can’t be used for a company login')
      .optional()
      .or(z.literal('')),
    phone: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? normalizePhone(v) : ''))
      .refine((v) => !v || PHONE_RE.test(v), 'Enter a valid phone number (digits only)'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  })
  .refine((data) => data.email || data.phone, { message: 'Provide an email or phone number', path: ['email'] });

export type SignUpFormState = { error?: string; fieldErrors?: Record<string, string>; identifier?: string };

/** Self-serve signup: a new company and its first OWNER login, together.
 * Switched off by SIGNUPS_DISABLED=1, in which case only the platform admin
 * (/admin) can add companies. */
/** Cloudflare Turnstile (optional): with TURNSTILE_SECRET_KEY set, signup
 * needs a passing challenge token from the widget on /signup. */
async function turnstilePasses(token: FormDataEntryValue | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== 'string' || !token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      cache: 'no-store',
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

export async function signUp(_prev: SignUpFormState, formData: FormData): Promise<SignUpFormState> {
  if (process.env.SIGNUPS_DISABLED === '1') return { error: 'New sign-ups are closed. Contact us to get an account.' };
  const ip = await requestIp();
  if (!(await turnstilePasses(formData.get('cf-turnstile-response'), ip))) return { error: 'Please complete the “I’m human” check and try again.' };
  // A handful of companies per network per hour is plenty for real people
  // and stops a script from filling the platform with junk workspaces.
  if (ip && !(await consumeRateLimit(`signup-ip:${ip}`, 5, 60 * 60 * 1000))) {
    return { error: 'Too many sign-ups from this network. Please try again in an hour.' };
  }
  const parsed = SignUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const { companyName, state, password } = parsed.data;
  const email = parsed.data.email || null;
  const phone = parsed.data.phone || null;

  // Logins are unique across the whole platform — sign-in doesn't ask which
  // company a login belongs to.
  const existing = await rootPrisma.user.findFirst({
    where: { OR: [...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []), ...(phone ? [{ phone }] : [])] },
    select: { id: true },
  });
  if (existing) {
    return { error: 'An account with that email or phone already exists.', fieldErrors: { email: 'Already in use' } };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const owner = await rootPrisma.$transaction(async (tx) => {
      // Company.email mirrors the owner's login email (src/actions/account.ts
      // keeps them in step) — it's what prints on invoices until changed.
      // Every new company starts on a free trial with every module.
      const company = await tx.company.create({
        data: { name: companyName, state, email, invoiceFY: currentIndianFY(), plan: 'growth', subscriptionStatus: 'TRIALING', trialEndsAt: addDays(new Date(), TRIAL_DAYS) },
      });
      return tx.user.create({ data: { companyId: company.id, email, phone, passwordHash, role: 'OWNER' }, select: { id: true } });
    });
    if (email) await sendVerificationEmail(owner.id);
  } catch (e) {
    // A race with another signup for the same email/phone.
    if (e instanceof Error && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return { error: 'An account with that email or phone already exists.', fieldErrors: { email: 'Already in use' } };
    }
    throw e;
  }

  return { identifier: email ?? phone ?? undefined };
}

async function currentOrigin() {
  // A reset link must point at this site — never at a host taken from headers
  // when the address is configured (src/lib/site-origin.ts).
  const configured = configuredSiteOrigin();
  if (configured) return configured;
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
  // Matched by shape, the same way sign-in does (src/auth.ts).
  const user = await rootPrisma.user.findFirst({
    where: isEmailIdentifier(identifier) ? { email: { equals: identifier, mode: 'insensitive' } } : { OR: [{ phone: normalizePhone(identifier) }, { phone: identifier }] },
    orderBy: { createdAt: 'asc' },
  });
  if (!user || !user.email) return { message };

  const token = crypto.randomBytes(32).toString('hex');
  await rootPrisma.passwordResetToken.create({
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

  const record = await rootPrisma.passwordResetToken.findUnique({ where: { token: parsed.data.token }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: 'This reset link is invalid or has expired. Request a new one.' };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  // Following a reset link proves the inbox is theirs, so it also confirms the email.
  const verifies = !!record.user.email && !record.user.emailVerifiedAt;
  await rootPrisma.$transaction([
    rootPrisma.user.update({ where: { id: record.userId }, data: { passwordHash, ...(verifies ? { emailVerifiedAt: new Date() } : {}) } }),
    rootPrisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await clearFailedLogins(record.user.email, record.user.phone);

  return { success: true };
}
