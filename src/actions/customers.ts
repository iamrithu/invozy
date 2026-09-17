'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';

const CustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  shopName: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  altPhone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  state: z.string().min(1),
  district: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  terms: z.string().default('Due on receipt'),
  creditLimit: z.coerce.number().min(0).default(0),
  fssaiNo: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
});

export type CustomerFormState = { error?: string; fieldErrors?: Record<string, string>; id?: string };

export type CustomerSort = 'name' | 'billed-desc';

/** DB-level search/filter/sort/pagination for the Customers list page. §3.5 —
 * guests get a real row (everything downstream depends on a real customer
 * relation) but are excluded from the main directory by default.
 *
 * "Billed: high to low" can't be a plain SQL ORDER BY — billed totals are
 * computed (GST math depends on company + customer state, not a stored
 * column), so that one sort mode fetches every matching row, sorts in JS via
 * getCustomerBillingTotals, and slices for the requested page. Every other
 * sort/filter/search runs as a real DB query with skip/take. */
export async function listCustomersPage(opts?: {
  search?: string;
  state?: string;
  sort?: CustomerSort;
  page?: number;
  pageSize?: number;
  includeGuests?: boolean;
}) {
  const company = await getCompany();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const where = {
    companyId: company.id,
    guest: opts?.includeGuests ? undefined : false,
    ...(opts?.search
      ? { OR: [{ name: { contains: opts.search, mode: 'insensitive' as const } }, { phone: { contains: opts.search } }] }
      : {}),
    ...(opts?.state && opts.state !== 'all' ? { state: opts.state } : {}),
  };

  if (opts?.sort === 'billed-desc') {
    const [all, totals] = await Promise.all([prisma.customer.findMany({ where }), getCustomerBillingTotals()]);
    const sorted = all.sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0));
    const items = sorted.slice((page - 1) * pageSize, page * pageSize);
    return { items: JSON.parse(JSON.stringify(items)), total: sorted.length };
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.customer.count({ where }),
  ]);
  // Decimal fields (creditLimit) don't cross the server-action boundary as
  // class instances — normalize to plain JSON so this is safe to call
  // directly from a client-side React Query queryFn, not just as a prop
  // handed down from a Server Component.
  return { items: JSON.parse(JSON.stringify(items)), total };
}

/** All customer states, for the list page's state filter dropdown — not
 * paginated, so it always reflects every state in the directory even when
 * the current filtered page doesn't happen to include them. */
export async function listCustomerStates() {
  const company = await getCompany();
  const rows = await prisma.customer.findMany({ where: { companyId: company.id, guest: false }, select: { state: true }, distinct: ['state'] });
  return rows.map((r) => r.state).sort();
}

/** Used by the invoice builder's Bill-To search — deliberately includes guests,
 * since a repeat walk-in should still be findable by name or phone. */
export async function searchCustomersForBilling(term: string) {
  const company = await getCompany();
  const customers = term
    ? await prisma.customer.findMany({
        where: {
          companyId: company.id,
          OR: [{ name: { contains: term, mode: 'insensitive' } }, { phone: { contains: term } }],
        },
        take: 8,
      })
    : await prisma.customer.findMany({ where: { companyId: company.id, guest: false }, orderBy: { name: 'asc' }, take: 8 });
  // Decimal (creditLimit) doesn't cross the server-action boundary as a class
  // instance — see listCustomers for the same normalization.
  return JSON.parse(JSON.stringify(customers));
}

export async function createCustomer(guest: boolean, _prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const parsed = CustomerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const company = await getCompany();
  const customer = await prisma.customer.create({ data: { ...parsed.data, guest, companyId: company.id } });
  revalidatePath('/customers');
  return { id: customer.id };
}

export async function updateCustomer(id: string, _prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const parsed = CustomerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  await prisma.customer.update({ where: { id }, data: parsed.data });
  revalidatePath('/customers');
  return {};
}

export async function deleteCustomer(id: string) {
  const hasInvoices = await prisma.invoice.findFirst({ where: { customerId: id } });
  if (hasInvoices) {
    throw new Error('This customer has invoices on file and can\u2019t be deleted.');
  }
  await prisma.customer.delete({ where: { id } });
  revalidatePath('/customers');
}

/** Powers the Customers list's "Billed: high to low" sort — one batched query
 * instead of N calls to getCustomerLedger. */
export async function getCustomerBillingTotals(): Promise<Record<string, number>> {
  const company = await getCompany();
  const invoices = await prisma.invoice.findMany({
    where: { companyId: company.id },
    include: { items: true, customer: { select: { state: true } } },
  });
  const { computeTotals } = await import('@/lib/gst');

  const totals: Record<string, number> = {};
  for (const inv of invoices) {
    const t = computeTotals(
      inv.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) })),
      { type: inv.overallDiscountType, value: Number(inv.overallDiscountValue) },
      {
        cgstRate: Number(company.cgstRate),
        sgstRate: Number(company.sgstRate),
        igstRate: Number(company.igstRate),
        cgstEnabled: company.cgstEnabled,
        sgstEnabled: company.sgstEnabled,
        igstEnabled: company.igstEnabled,
      },
      company.state,
      inv.customer.state
    );
    totals[inv.customerId] = (totals[inv.customerId] ?? 0) + t.total;
  }
  return totals;
}

/** Powers the Customers detail pane's ledger section — invoices + running totals. */
export async function getCustomerLedger(id: string) {
  const [customer, company] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id },
      include: { invoices: { include: { items: true, payments: true }, orderBy: { date: 'desc' } } },
    }),
    getCompany(),
  ]);

  const { computeTotals } = await import('@/lib/gst');

  let totalBilled = 0;
  let outstanding = 0;
  const invoicesWithTotals = customer.invoices.map((inv) => {
    const totals = computeTotals(
      inv.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) })),
      { type: inv.overallDiscountType, value: Number(inv.overallDiscountValue) },
      {
        cgstRate: Number(company.cgstRate),
        sgstRate: Number(company.sgstRate),
        igstRate: Number(company.igstRate),
        cgstEnabled: company.cgstEnabled,
        sgstEnabled: company.sgstEnabled,
        igstEnabled: company.igstEnabled,
      },
      company.state,
      customer.state
    );
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = totals.total - paid;
    totalBilled += totals.total;
    outstanding += Math.max(balance, 0);
    return { ...inv, computedTotal: totals.total, amountPaid: paid, balanceDue: balance };
  });

  const result = { customer, invoices: invoicesWithTotals, totalBilled, outstanding, invoiceCount: customer.invoices.length };
  // Same Decimal/Date normalization as listCustomers — keeps this safe to
  // call directly from a client-side queryFn.
  return JSON.parse(JSON.stringify(result));
}
