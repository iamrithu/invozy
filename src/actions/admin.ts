'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { currentIndianFY, computeTotals } from '@/lib/gst';

/** Every admin action re-checks the role itself — defense in depth beyond
 * the middleware, since a server action can in principle be invoked
 * directly without going through a page route. */
async function requireSuperAdmin() {
  const session = await auth();
  if (session?.user?.role !== 'SUPER_ADMIN') {
    throw new Error('Not authorized.');
  }
}

export async function listCompaniesForAdmin(opts?: { search?: string; page?: number; pageSize?: number }) {
  await requireSuperAdmin();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const where = opts?.search
    ? {
        OR: [
          { name: { contains: opts.search, mode: 'insensitive' as const } },
          { users: { some: { email: { contains: opts.search, mode: 'insensitive' as const } } } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: { users: { select: { id: true, email: true, phone: true, createdAt: true }, orderBy: { createdAt: 'asc' } }, _count: { select: { invoices: true, customers: true, products: true } } },
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.company.count({ where }),
  ]);
  return { items: JSON.parse(JSON.stringify(items)), total };
}

export async function getCompanyForAdmin(id: string) {
  await requireSuperAdmin();
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, email: true, phone: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      _count: { select: { invoices: true, customers: true, products: true } },
    },
  });
  if (!company) return null;

  const recent = await prisma.invoice.findMany({
    where: { companyId: id },
    include: { items: true, payments: true, customer: true },
    orderBy: { date: 'desc' },
    take: 10,
  });
  const recentInvoices = recent.map((inv) => {
    const totals = computeTotals(
      inv.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) })),
      { type: inv.overallDiscountType, value: Number(inv.overallDiscountValue) },
      {
        cgstRate: Number(inv.cgstRate),
        sgstRate: Number(inv.sgstRate),
        igstRate: Number(inv.igstRate),
        cgstEnabled: inv.cgstEnabled,
        sgstEnabled: inv.sgstEnabled,
        igstEnabled: inv.igstEnabled,
      },
      company.state,
      inv.customer.state
    );
    return { id: inv.id, number: inv.number, date: inv.date, status: inv.status, customerName: inv.customer.name, total: totals.total };
  });

  return { ...JSON.parse(JSON.stringify(company)), recentInvoices: JSON.parse(JSON.stringify(recentInvoices)) };
}

const CreateCompanySchema = z
  .object({
    companyName: z.string().min(1, 'Company name is required'),
    state: z.string().min(1, 'State is required'),
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    phone: z.string().min(7, 'Enter a valid phone number').optional().or(z.literal('')),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  })
  .refine((data) => data.email || data.phone, { message: 'Provide an email or phone number', path: ['email'] });

export type CreateCompanyFormState = { error?: string; fieldErrors?: Record<string, string> };

export async function createCompanyWithUser(_prev: CreateCompanyFormState, formData: FormData): Promise<CreateCompanyFormState> {
  await requireSuperAdmin();
  const parsed = CreateCompanySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const { companyName, state, password } = parsed.data;
  const email = parsed.data.email || null;
  const phone = parsed.data.phone || null;

  const existing = await prisma.user.findFirst({ where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] } });
  if (existing) {
    return { error: 'A user with that email or phone already exists.', fieldErrors: { email: 'Already in use' } };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(async (tx) => {
    // Company.email mirrors the owner's login email — see signUp() in
    // src/actions/auth.ts for the same rule on public self-serve signup.
    const company = await tx.company.create({ data: { name: companyName, state, email, invoiceFY: currentIndianFY() } });
    await tx.user.create({ data: { email, phone, passwordHash, companyId: company.id, role: 'OWNER' } });
  });

  return {};
}

const ResetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export type ResetPasswordFormState = { error?: string };

export async function resetUserPassword(_prev: ResetPasswordFormState, formData: FormData): Promise<ResetPasswordFormState> {
  await requireSuperAdmin();
  const parsed = ResetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: parsed.data.userId }, data: { passwordHash } });
  return {};
}
