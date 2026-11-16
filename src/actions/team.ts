'use server';

import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { refresh } from 'next/cache';
import { prisma, rootPrisma } from '@/lib/prisma';
import { isReservedLoginEmail } from '@/lib/login-identifiers';
import { clearFailedLogins } from '@/lib/login-rate-limit';
import { requireOwner, requireUser } from '@/lib/session';
import { logActivity } from '@/lib/activity';
import { toActionError } from '@/lib/action-result';
import { currentCompanyId } from '@/lib/tenant';
import { requireModule } from '@/lib/require-module';
import { assertCanCreate } from '@/lib/subscription-guard';
import { sendVerificationEmail } from '@/lib/email-verification';

/** Logins for the one company — the owner adds staff here instead of
 * running `npm run setup` for each person. Every mutation is owner-only
 * (requireOwner), refuses to touch the caller's own login (that goes
 * through My account, which asks for the current password), and is
 * written to the activity log as entityType 'user'. */

// Same cost as scripts/setup-company.ts and changeMyPassword, so every
// stored hash takes the same time to check at login.
const BCRYPT_COST = 10;
// Stricter than the 6-character self-service minimum: this is a password
// the owner reads out or texts to someone, so it should survive a guess.
const MIN_TEMP_PASSWORD = 8;
const MAX_NAME = 80;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Stored without spaces/dashes — sign-in compares the phone exactly, so a
// single canonical form is what the owner should hand out.
const PHONE_RE = /^\+?\d{7,15}$/;

export type TeamRole = 'OWNER' | 'STAFF';

export type TeamMember = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: TeamRole;
  active: boolean;
  createdAt: string;
};

export type LoginDetailsInput = { name: string; email?: string | null; phone?: string | null };

export type TeamFormResult = { error?: string; fieldErrors?: Record<string, string>; id?: string };

const memberSelect = { id: true, name: true, email: true, phone: true, role: true, active: true, createdAt: true } as const;

function toMember(u: Prisma.UserGetPayload<{ select: typeof memberSelect }>): TeamMember {
  return { ...u, createdAt: u.createdAt.toISOString() };
}

function labelOf(u: { name: string | null; email: string | null; phone: string | null }) {
  return u.name || u.email || u.phone || 'a login';
}

function roleWord(role: TeamRole) {
  return role === 'OWNER' ? 'owner' : 'staff';
}

/** Owner-only: every login, active first, owners before staff. */
export async function listLogins(): Promise<{ error?: string; users?: TeamMember[] }> {
  try {
    await requireOwner();
    const users = await prisma.user.findMany({
      select: memberSelect,
      orderBy: [{ active: 'desc' }, { role: 'asc' }, { createdAt: 'asc' }],
    });
    return { users: users.map(toMember) };
  } catch (err) {
    return toActionError(err);
  }
}

/** Trims/normalises a name + sign-in identifiers and reports what's wrong
 * per field, in the same `fieldErrors` shape the app's other forms use. */
function parseDetails(input: LoginDetailsInput) {
  const fieldErrors: Record<string, string> = {};
  const name = (input.name ?? '').trim().replace(/\s+/g, ' ');
  const email = (input.email ?? '').trim().toLowerCase() || null;
  const phone = (input.phone ?? '').replace(/[\s()-]/g, '') || null;

  if (!name) fieldErrors.name = 'Enter their name — it shows in the activity log';
  else if (name.length > MAX_NAME) fieldErrors.name = `Keep it under ${MAX_NAME} characters`;
  if (email && !EMAIL_RE.test(email)) fieldErrors.email = 'Enter a valid email';
  else if (isReservedLoginEmail(email)) fieldErrors.email = 'This email can’t be used for a company login';
  if (phone && !PHONE_RE.test(phone)) fieldErrors.phone = 'Enter a valid phone number (digits only)';
  if (!email && !phone) fieldErrors.email = 'Add an email or a phone number — it’s what they sign in with';
  return { name, email, phone, fieldErrors };
}

/** Readable "already taken" instead of a unique-constraint failure. Email is
 * compared case-insensitively, the same way sign-in looks it up — and across
 * every company (rootPrisma), because sign-in doesn't ask which company a
 * login belongs to, so an email or phone can only exist once platform-wide.
 * Only whether it's taken is used, never the other login's details. */
async function findIdentifierClash(email: string | null, phone: string | null, exceptId?: string): Promise<TeamFormResult | null> {
  const or: Prisma.UserWhereInput[] = [];
  if (email) or.push({ email: { equals: email, mode: 'insensitive' } });
  if (phone) or.push({ phone });
  if (!or.length) return null;
  const clash = await rootPrisma.user.findFirst({
    where: { OR: or, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { email: true, phone: true },
  });
  if (!clash) return null;
  const fieldErrors: Record<string, string> = {};
  if (email && clash.email?.toLowerCase() === email) fieldErrors.email = 'Another login already uses this email';
  if (phone && clash.phone === phone) fieldErrors.phone = 'Another login already uses this phone';
  return { error: 'That email or phone is already used by another login.', fieldErrors };
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** A fresh password means a fresh start — any lockout from earlier wrong
 * guesses on this person's identifiers is lifted (keys match
 * src/lib/login-rate-limit.ts: trimmed + lowercased). */
async function clearLockouts(...identifiers: (string | null)[]) {
  await clearFailedLogins(...identifiers);
}

function checkPassword(password: string | undefined): string | null {
  if (!password || password.length < MIN_TEMP_PASSWORD) return `Use at least ${MIN_TEMP_PASSWORD} characters`;
  return null;
}

/** Adds a login. Defaults to STAFF — making another owner is a deliberate
 * choice in the dialog. */
export async function createLogin(input: LoginDetailsInput & { password: string; role?: TeamRole }): Promise<TeamFormResult> {
  try {
    await requireModule('team');
    await assertCanCreate('login');
    const me = await requireOwner();
    const { name, email, phone, fieldErrors } = parseDetails(input);
    const passwordError = checkPassword(input.password);
    if (passwordError) fieldErrors.password = passwordError;
    if (Object.keys(fieldErrors).length) return { error: 'Check the highlighted fields.', fieldErrors };

    const clash = await findIdentifierClash(email, phone);
    if (clash) return clash;

    const role: TeamRole = input.role === 'OWNER' ? 'OWNER' : 'STAFF';
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const user = await prisma.user.create({ data: { name, email, phone, role, passwordHash, active: true }, select: { id: true } });
    await clearLockouts(email, phone);

    await logActivity({
      userId: me.id,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      summary: `Added ${roleWord(role)} login for ${name} (${email ?? phone})`,
    });
    if (email) await sendVerificationEmail(user.id);
    return { id: user.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: 'That email or phone is already used by another login.' };
    return toActionError(err);
  }
}

/** Fixes someone else's name or sign-in email/phone. Your own login is
 * edited from My account instead. */
export async function updateLogin(userId: string, input: LoginDetailsInput): Promise<TeamFormResult> {
  try {
    await requireModule('team');
    const me = await requireOwner();
    if (userId === me.id) return { error: 'Edit your own details from My account.' };
    const { name, email, phone, fieldErrors } = parseDetails(input);
    if (Object.keys(fieldErrors).length) return { error: 'Check the highlighted fields.', fieldErrors };

    const before = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } });
    if (!before) return { error: 'That login no longer exists.' };
    const clash = await findIdentifierClash(email, phone, userId);
    if (clash) return clash;

    const emailChanged = before.email !== email;
    await prisma.user.update({ where: { id: userId }, data: { name, email, phone, ...(emailChanged ? { emailVerifiedAt: null } : {}) } });
    if (emailChanged && email) await sendVerificationEmail(userId);

    const changes = [
      before.name !== name && `name to ${name}`,
      before.email !== email && (email ? `email to ${email}` : 'removed email'),
      before.phone !== phone && (phone ? `phone to ${phone}` : 'removed phone'),
    ].filter(Boolean);
    if (changes.length) {
      await logActivity({
        userId: me.id,
        action: 'user.updated',
        entityType: 'user',
        entityId: userId,
        summary: `Changed ${labelOf(before)}'s ${changes.join(', ')}`,
      });
    }
    return { id: userId };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: 'That email or phone is already used by another login.' };
    return toActionError(err);
  }
}

/** Applies a role/active change while guaranteeing at least one active
 * owner survives it. Every active-owner row is locked first (FOR UPDATE),
 * so two owners demoting or disabling each other at the same moment queue
 * up here — the second re-reads the rows after the first commits and is
 * refused — instead of both passing the check and leaving nobody able to
 * manage the business. */
async function updateKeepingAnOwner(userId: string, data: { role?: TeamRole; active?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const owners = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "companyId" = ${await currentCompanyId()} AND "role" = 'OWNER' AND "active" = true FOR UPDATE`;
    const before = await tx.user.findUnique({ where: { id: userId }, select: memberSelect });
    if (!before) throw new Error('That login no longer exists.');

    const stillOwner = (data.role ?? before.role) === 'OWNER' && (data.active ?? before.active);
    const ownersAfter = owners.filter((o) => o.id !== userId).length + (stillOwner ? 1 : 0);
    if (ownersAfter < 1) throw new Error('There must always be at least one active owner.');

    await tx.user.update({ where: { id: userId }, data });
    return before;
  });
}

/** Makes a login an owner or staff. You can't change your own role — so
 * an owner can never lock themselves out of this screen by accident. */
export async function setLoginRole(userId: string, role: TeamRole): Promise<{ error?: string }> {
  try {
    await requireModule('team');
    const me = await requireOwner();
    if (role !== 'OWNER' && role !== 'STAFF') return { error: 'Pick Owner or Staff.' };
    if (userId === me.id) return { error: 'You can’t change your own role. Another owner can do it for you.' };

    const before = await updateKeepingAnOwner(userId, { role });
    if (before.role !== role) {
      await logActivity({
        userId: me.id,
        action: 'user.role-changed',
        entityType: 'user',
        entityId: userId,
        summary: `Made ${labelOf(before)} ${role === 'OWNER' ? 'an owner' : 'staff'}`,
      });
    }
    return {};
  } catch (err) {
    return toActionError(err);
  }
}

/** Disables or re-enables a login. A disabled login can't sign in, and
 * any session it already has stops working on its next request
 * (requireUser treats inactive users as signed out). Its history stays. */
export async function setLoginActive(userId: string, active: boolean): Promise<{ error?: string }> {
  try {
    await requireModule('team');
    if (active) await assertCanCreate('login');
    const me = await requireOwner();
    if (userId === me.id) return { error: 'You can’t disable your own login.' };

    const before = await updateKeepingAnOwner(userId, { active: !!active });
    if (before.active !== !!active) {
      await logActivity({
        userId: me.id,
        action: active ? 'user.enabled' : 'user.disabled',
        entityType: 'user',
        entityId: userId,
        summary: `${active ? 'Re-enabled' : 'Disabled'} the login for ${labelOf(before)}`,
      });
    }
    return {};
  } catch (err) {
    return toActionError(err);
  }
}

/** Sets a new temporary password for someone who forgot theirs. They can
 * change it themselves afterwards from My account. Sessions already signed
 * in elsewhere stay signed in (sessions are signed cookies) — disable the
 * login instead if it may be in the wrong hands. */
export async function resetLoginPassword(userId: string, password: string): Promise<TeamFormResult> {
  try {
    await requireModule('team');
    const me = await requireOwner();
    if (userId === me.id) return { error: 'Change your own password from My account.' };
    const passwordError = checkPassword(password);
    if (passwordError) return { error: passwordError, fieldErrors: { password: passwordError } };

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } });
    if (!target) return { error: 'That login no longer exists.' };

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await clearLockouts(target.email, target.phone);

    await logActivity({
      userId: me.id,
      action: 'user.password-reset',
      entityType: 'user',
      entityId: userId,
      summary: `Set a new password for ${labelOf(target)}`,
    });
    return { id: userId };
  } catch (err) {
    return toActionError(err);
  }
}

/** Any login — owner or staff — can set their own display name (the name
 * shown in the top bar and on everything they do in the activity log).
 * Lives here rather than in src/actions/account.ts because it's the one
 * self-service change that has nothing to do with sign-in credentials. */
export async function updateMyName(name: string): Promise<TeamFormResult> {
  try {
    const me = await requireUser();
    const clean = (name ?? '').trim().replace(/\s+/g, ' ');
    if (!clean) return { error: 'Enter your name.', fieldErrors: { name: 'Enter your name' } };
    if (clean.length > MAX_NAME) return { error: `Keep it under ${MAX_NAME} characters.`, fieldErrors: { name: `Keep it under ${MAX_NAME} characters` } };
    if (clean === me.name) return {};

    await prisma.user.update({ where: { id: me.id }, data: { name: clean } });
    await logActivity({
      userId: me.id,
      action: 'user.renamed',
      entityType: 'user',
      entityId: me.id,
      summary: me.name ? `Changed their name from ${me.name} to ${clean}` : `Set their name to ${clean}`,
    });
    // The top bar's name comes from the app layout (CurrentUserProvider) —
    // re-render it so the new name shows without a full reload.
    refresh();
    return {};
  } catch (err) {
    return toActionError(err);
  }
}
