'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { rootPrisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/session';
import { currentIndianFY } from '@/lib/gst';
import { istDayRangeUtc, todayIst } from '@/lib/dates';
import { isModuleKey, MODULE_KEYS } from '@/lib/modules';
import { isReservedLoginEmail, normalizePhone, PHONE_RE } from '@/lib/login-identifiers';
import { clearFailedLogins } from '@/lib/login-rate-limit';

// The platform admin's actions (/admin). The admin has no company of its
// own, so everything here uses the unscoped `rootPrisma` — and every action
// re-checks requireSuperAdmin() itself, since a server action can be called
// directly without going through a page route. Nothing here reads a
// company's business documents beyond counts, totals and the latest few
// invoice headers.

type ActionResult = { error?: string; fieldErrors?: Record<string, string> };

const companyUserSelect = { id: true, name: true, email: true, phone: true, role: true, active: true, createdAt: true } satisfies Prisma.UserSelect;

/** Billed (issued, non-draft) total, outstanding and last invoice date per
 * company, from the stored invoice totals — one grouped query for a page. */
async function billingByCompany(companyIds: string[]) {
  if (!companyIds.length) return new Map<string, { billed: number; outstanding: number; lastInvoiceAt: Date | null }>();
  const rows = await rootPrisma.$queryRaw<{ companyId: string; billed: number; outstanding: number; last: Date | null }[]>`
    SELECT "companyId", COALESCE(SUM(total), 0)::float8 AS billed,
      COALESCE(SUM(GREATEST(total - "amountPaid", 0)), 0)::float8 AS outstanding, MAX(date) AS last
    FROM "Invoice" WHERE status <> 'DRAFT' AND "companyId" IN (${Prisma.join(companyIds)})
    GROUP BY "companyId"`;
  return new Map(rows.map((r) => [r.companyId, { billed: r.billed, outstanding: r.outstanding, lastInvoiceAt: r.last }]));
}

export type AdminCompanyStatus = 'all' | 'active' | 'suspended';

export async function listCompaniesForAdmin(opts?: { search?: string; status?: AdminCompanyStatus; page?: number; pageSize?: number }) {
  await requireSuperAdmin();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts?.pageSize ?? 20, 1), 100);
  const search = opts?.search?.trim();
  const where: Prisma.CompanyWhereInput = {
    ...(opts?.status === 'active' ? { active: true } : opts?.status === 'suspended' ? { active: false } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { gstin: { contains: search, mode: 'insensitive' } },
            { users: { some: { OR: [{ email: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    rootPrisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        state: true,
        gstin: true,
        active: true,
        disabledModules: true,
        createdAt: true,
        users: { select: companyUserSelect, orderBy: { createdAt: 'asc' } },
        _count: { select: { invoices: true, customers: true, products: true, users: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    rootPrisma.company.count({ where }),
  ]);
  const billing = await billingByCompany(items.map((c) => c.id));
  const rows = items.map((c) => ({ ...c, ...(billing.get(c.id) ?? { billed: 0, outstanding: 0, lastInvoiceAt: null }) }));
  return { items: JSON.parse(JSON.stringify(rows)) as AdminCompanyRow[], total };
}

export type AdminCompanyUser = { id: string; name: string | null; email: string | null; phone: string | null; role: 'OWNER' | 'STAFF'; active: boolean; createdAt: string };

export type AdminCompanyRow = {
  id: string;
  name: string;
  state: string;
  gstin: string | null;
  active: boolean;
  disabledModules: string[];
  createdAt: string;
  users: AdminCompanyUser[];
  _count: { invoices: number; customers: number; products: number; users: number };
  billed: number;
  outstanding: number;
  lastInvoiceAt: string | null;
};

/** The numbers across the top of /admin. */
export async function getPlatformStats() {
  await requireSuperAdmin();
  const monthStart = istDayRangeUtc(`${todayIst().slice(0, 7)}-01`).gte;
  const [companies, active, users, newThisMonth, [month]] = await Promise.all([
    rootPrisma.company.count(),
    rootPrisma.company.count({ where: { active: true } }),
    rootPrisma.user.count({ where: { active: true } }),
    rootPrisma.company.count({ where: { createdAt: { gte: monthStart } } }),
    rootPrisma.$queryRaw<{ invoices: number; billed: number }[]>`
      SELECT COUNT(*)::int AS invoices, COALESCE(SUM(total), 0)::float8 AS billed
      FROM "Invoice" WHERE status <> 'DRAFT' AND date >= ${monthStart}`,
  ]);
  return { companies, active, suspended: companies - active, users, newThisMonth, invoicesThisMonth: month?.invoices ?? 0, billedThisMonth: month?.billed ?? 0 };
}

export type PlatformStats = Awaited<ReturnType<typeof getPlatformStats>>;

export async function getCompanyForAdmin(id: string) {
  await requireSuperAdmin();
  const company = await rootPrisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      state: true,
      district: true,
      address: true,
      gstin: true,
      email: true,
      phone: true,
      invoicePrefix: true,
      invoiceTemplate: true,
      active: true,
      disabledModules: true,
      createdAt: true,
      users: { select: { ...companyUserSelect, onboardedAt: true }, orderBy: { createdAt: 'asc' } },
      _count: { select: { invoices: true, customers: true, products: true, suppliers: true, purchases: true, creditNotes: true } },
    },
  });
  if (!company) return null;

  const [billing, recent] = await Promise.all([
    billingByCompany([id]),
    rootPrisma.invoice.findMany({
      where: { companyId: id },
      select: { id: true, number: true, date: true, status: true, total: true, customer: { select: { name: true, shopName: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
  ]);
  const recentInvoices = recent.map((inv) => ({
    id: inv.id,
    number: inv.number,
    date: inv.date.toISOString(),
    status: inv.status,
    customerName: inv.customer.shopName || inv.customer.name,
    total: Number(inv.total),
  }));
  const summary = billing.get(id) ?? { billed: 0, outstanding: 0, lastInvoiceAt: null };
  return JSON.parse(JSON.stringify({ ...company, ...summary, recentInvoices })) as AdminCompanyDetail;
}

export type AdminCompanyDetail = {
  id: string;
  name: string;
  state: string;
  district: string | null;
  address: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  invoicePrefix: string;
  invoiceTemplate: string;
  active: boolean;
  disabledModules: string[];
  createdAt: string;
  users: (AdminCompanyUser & { onboardedAt: string | null })[];
  _count: { invoices: number; customers: number; products: number; suppliers: number; purchases: number; creditNotes: number };
  billed: number;
  outstanding: number;
  lastInvoiceAt: string | null;
  recentInvoices: { id: string; number: string; date: string; status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID'; customerName: string; total: number }[];
};

const CreateCompanySchema = z
  .object({
    companyName: z.string().trim().min(1, 'Company name is required').max(120),
    state: z.string().min(1, 'State is required'),
    ownerName: z.string().trim().max(80).optional().or(z.literal('')),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email')
      .refine((v) => !isReservedLoginEmail(v), 'That’s the platform admin’s email — use another')
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

export type CreateCompanyFormState = ActionResult & { companyId?: string };

/** Admin-led onboarding: a company and its first OWNER login, together.
 * Optional `disabledModules` form values start it with modules switched off. */
export async function createCompanyWithUser(_prev: CreateCompanyFormState, formData: FormData): Promise<CreateCompanyFormState> {
  await requireSuperAdmin();
  const parsed = CreateCompanySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const { companyName, state, password } = parsed.data;
  const email = parsed.data.email || null;
  const phone = parsed.data.phone || null;
  const ownerName = parsed.data.ownerName || null;

  // Logins are unique platform-wide — sign-in doesn't ask which company.
  const existing = await rootPrisma.user.findFirst({
    where: { OR: [...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []), ...(phone ? [{ phone }] : [])] },
    select: { id: true },
  });
  if (existing) return { error: 'A login with that email or phone already exists.', fieldErrors: { email: 'Already in use' } };

  const disabledModules = formData.getAll('disabledModules').map(String).filter(isModuleKey);
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const company = await rootPrisma.$transaction(async (tx) => {
      // Company.email mirrors the owner's login email — see src/actions/auth.ts signUp.
      const created = await tx.company.create({ data: { name: companyName, state, email, invoiceFY: currentIndianFY(), disabledModules } });
      await tx.user.create({ data: { companyId: created.id, name: ownerName, email, phone, passwordHash, role: 'OWNER' } });
      return created;
    });
    revalidatePath('/admin');
    return { companyId: company.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'A login with that email or phone already exists.', fieldErrors: { email: 'Already in use' } };
    }
    throw e;
  }
}

const ResetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export type ResetPasswordFormState = { error?: string };

export async function resetUserPassword(_prev: ResetPasswordFormState, formData: FormData): Promise<ResetPasswordFormState> {
  await requireSuperAdmin();
  const parsed = ResetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const user = await rootPrisma.user.findUnique({ where: { id: parsed.data.userId }, select: { email: true, phone: true } });
  if (!user) return { error: 'That login no longer exists.' };
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await rootPrisma.user.update({ where: { id: parsed.data.userId }, data: { passwordHash } });
  // A fresh password lifts any lockout on this login.
  await clearFailedLogins(user.email, user.phone);
  return {};
}

/** Suspends or restores a company. Suspended: its logins are refused at
 * sign-in and on every request (src/lib/session.ts), and its signed links
 * (shared invoices) stop working. Nothing is deleted. */
export async function setCompanyActive(companyId: string, active: boolean): Promise<ActionResult> {
  await requireSuperAdmin();
  const res = await rootPrisma.company.updateMany({ where: { id: companyId }, data: { active } });
  if (!res.count) return { error: 'That company no longer exists.' };
  revalidatePath('/admin');
  revalidatePath(`/admin/companies/${companyId}`);
  return {};
}

/** Which optional modules (src/lib/modules.ts) are switched off. */
export async function setCompanyModules(companyId: string, disabled: string[]): Promise<ActionResult> {
  await requireSuperAdmin();
  const unique = [...new Set(disabled)];
  const clean = unique.filter(isModuleKey);
  if (clean.length !== unique.length) return { error: `Unknown module. Valid: ${MODULE_KEYS.join(', ')}.` };
  const res = await rootPrisma.company.updateMany({ where: { id: companyId }, data: { disabledModules: clean } });
  if (!res.count) return { error: 'That company no longer exists.' };
  revalidatePath(`/admin/companies/${companyId}`);
  return {};
}

/** Switches one login on or off — e.g. a compromised account. Never the
 * company's last active owner (suspend the company instead). */
export async function setUserActiveForAdmin(userId: string, active: boolean): Promise<ActionResult> {
  await requireSuperAdmin();
  return rootPrisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { companyId: true, role: true, active: true } });
    if (!user) return { error: 'That login no longer exists.' };
    if (!active && user.role === 'OWNER' && user.active) {
      const otherOwners = await tx.user.count({ where: { companyId: user.companyId, role: 'OWNER', active: true, id: { not: userId } } });
      if (!otherOwners) return { error: 'This is the company’s only active owner. Reset its password instead, or suspend the company.' };
    }
    await tx.user.update({ where: { id: userId }, data: { active } });
    revalidatePath(`/admin/companies/${user.companyId}`);
    return {};
  });
}
