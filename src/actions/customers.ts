'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { requireUser } from '@/lib/session';
import { recomputeStoredTotals } from '@/lib/invoice-totals';

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
 * "Billed: high to low" ranks by a per-customer SUM over Invoice's stored
 * totals (one GROUP BY via getCustomerBillingTotals), then sorts the
 * matching customers by it in JS and slices the requested page — Prisma
 * can't ORDER BY a relation aggregate. Every other sort/filter/search runs
 * as a real DB query with skip/take. */
export async function listCustomersPage(opts?: {
  search?: string;
  state?: string;
  sort?: CustomerSort;
  page?: number;
  pageSize?: number;
  includeGuests?: boolean;
}) {
  await requireUser();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const where = {
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
  await requireUser();
  const rows = await prisma.customer.findMany({ where: { guest: false }, select: { state: true }, distinct: ['state'] });
  return rows.map((r) => r.state).sort();
}

/** The full non-guest customer directory (id + display name only), for a
 * "Customer" filter dropdown on the Invoices and Reports list screens —
 * unlike searchCustomersForBilling below, this isn't capped at 8 or gated
 * behind a search term, since a filter dropdown needs every option up
 * front, not just the first few matches. */
export async function listCustomersForFilter() {
  await requireUser();
  const customers = await prisma.customer.findMany({
    where: { guest: false },
    select: { id: true, name: true, shopName: true },
    orderBy: { name: 'asc' },
  });
  return customers;
}

/** Used by the invoice builder's Bill-To search — deliberately includes guests,
 * since a repeat walk-in should still be findable by name or phone. */
export async function searchCustomersForBilling(term: string) {
  await requireUser();
  const customers = term
    ? await prisma.customer.findMany({
        where: { OR: [{ name: { contains: term, mode: 'insensitive' } }, { phone: { contains: term } }] },
        orderBy: { name: 'asc' },
        take: 8,
      })
    : await prisma.customer.findMany({ where: { guest: false }, orderBy: { name: 'asc' }, take: 8 });
  // Decimal (creditLimit) doesn't cross the server-action boundary as a class
  // instance — see listCustomers for the same normalization.
  return JSON.parse(JSON.stringify(customers));
}

export async function createCustomer(guest: boolean, _prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const parsed = CustomerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  await requireUser();
  const customer = await prisma.customer.create({ data: { ...parsed.data, guest } });
  revalidatePath('/customers');
  return { id: customer.id };
}

export async function updateCustomer(id: string, _prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const parsed = CustomerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const [company, existing] = await Promise.all([getCompany(), prisma.customer.findUnique({ where: { id }, select: { state: true } })]);
  if (!existing) return { error: 'Customer not found.' };
  await prisma.customer.update({ where: { id }, data: parsed.data });
  // The customer's state decides IGST vs CGST+SGST on each of their
  // invoices, so a state change has to re-derive those invoices' stored
  // totals — exactly as the live computeTotals() on the invoice page will.
  if (existing.state !== parsed.data.state) {
    await recomputeStoredTotals({ customerId: id }, company.state);
    revalidatePath('/invoices');
    revalidatePath('/dashboard');
  }
  revalidatePath('/customers');
  return {};
}

export async function deleteCustomer(id: string) {
  await requireUser();
  const hasInvoices = await prisma.invoice.findFirst({ where: { customerId: id }, select: { id: true } });
  if (hasInvoices) {
    throw new Error('This customer has invoices on file and can\u2019t be deleted.');
  }
  const { count } = await prisma.customer.deleteMany({ where: { id } });
  if (!count) throw new Error('Customer not found.');
  revalidatePath('/customers');
}

/** Powers the Customers list's "Billed: high to low" sort — one GROUP BY
 * over the stored invoice totals. */
export async function getCustomerBillingTotals(): Promise<Record<string, number>> {
  await requireUser();
  const rows = await prisma.invoice.groupBy({ by: ['customerId'], _sum: { total: true } });
  return Object.fromEntries(rows.map((r) => [r.customerId, Number(r._sum.total ?? 0)]));
}

/** Powers the Customers detail pane's ledger section — invoices + running totals. */
export async function getCustomerLedger(id: string) {
  await requireUser();
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      invoices: {
        select: { id: true, number: true, date: true, due: true, status: true, total: true, amountPaid: true },
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
      },
    },
  });
  if (!customer) throw new Error('Customer not found.');

  const { invoices: rows, ...customerFields } = customer;
  let totalBilled = 0;
  let outstanding = 0;
  const invoices = rows.map((inv) => {
    const total = Number(inv.total);
    const paid = Number(inv.amountPaid);
    totalBilled += total;
    outstanding += Math.max(total - paid, 0);
    return { ...inv, computedTotal: total, amountPaid: paid, balanceDue: total - paid };
  });

  const result = { customer: customerFields, invoices, totalBilled, outstanding, invoiceCount: invoices.length };
  // Same Decimal/Date normalization as listCustomers — keeps this safe to
  // call directly from a client-side queryFn.
  return JSON.parse(JSON.stringify(result));
}
