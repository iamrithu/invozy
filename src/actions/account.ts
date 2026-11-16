'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { prisma, rootPrisma } from '@/lib/prisma';
import { isReservedLoginEmail, normalizePhone, PHONE_RE } from '@/lib/login-identifiers';
import { requireUser } from '@/lib/session';
import { currentCompanyId } from '@/lib/tenant';

async function requireUserId() {
  return (await requireUser()).id;
}

const ProfileSchema = z
  .object({
    email: z
      .string()
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
  })
  .refine((data) => data.email || data.phone, {
    message: 'Provide an email or phone number',
    path: ['email'],
  });

export type ProfileFormState = { error?: string; fieldErrors?: Record<string, string> };

export async function updateMyProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const me = await requireUser();
  const userId = me.id;
  const parsed = ProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const email = parsed.data.email?.trim().toLowerCase() || null;
  const phone = parsed.data.phone || null;

  // Across every company: logins are unique platform-wide (sign-in doesn't
  // ask which company). Only "taken or not" is used.
  const existing = await rootPrisma.user.findFirst({
    where: { id: { not: userId }, OR: [...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []), ...(phone ? [{ phone }] : [])] },
    select: { id: true },
  });
  if (existing) {
    return { error: 'That email or phone is already used by another account.', fieldErrors: { email: 'Already in use' } };
  }

  // Company.email mirrors the *owner's* login email (see
  // src/actions/company.ts) — a staff login changing its own email must
  // never rewrite what prints on every invoice.
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { email, phone } }),
    ...(me.role === 'OWNER' ? [prisma.company.update({ where: { id: await currentCompanyId() }, data: { email } })] : []),
  ]);
  revalidatePath('/account');
  revalidatePath('/company');
  return {};
}

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type PasswordFormState = { error?: string; fieldErrors?: Record<string, string> };

export async function changeMyPassword(_prev: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const userId = await requireUserId();
  const parsed = PasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return { error: 'Current password is incorrect.', fieldErrors: { currentPassword: 'Incorrect password' } };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return {};
}
