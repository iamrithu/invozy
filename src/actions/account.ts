'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { COMPANY_ID } from '@/lib/company-id';

async function requireUserId() {
  return (await requireUser()).id;
}

const ProfileSchema = z
  .object({
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    phone: z.string().min(7, 'Enter a valid phone number').optional().or(z.literal('')),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Provide an email or phone number',
    path: ['email'],
  });

export type ProfileFormState = { error?: string; fieldErrors?: Record<string, string> };

export async function updateMyProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const userId = await requireUserId();
  const parsed = ProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const email = parsed.data.email?.trim().toLowerCase() || null;
  const phone = parsed.data.phone || null;

  const existing = await prisma.user.findFirst({
    where: { id: { not: userId }, OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
  });
  if (existing) {
    return { error: 'That email or phone is already used by another account.', fieldErrors: { email: 'Already in use' } };
  }

  // Company.email mirrors the login email (see src/actions/company.ts) —
  // this is the single place that value is ever written after setup.
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { email, phone } }),
    prisma.company.update({ where: { id: COMPANY_ID }, data: { email } }),
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
