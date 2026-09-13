'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { computeTotals, formatInvoiceNumber, isOverCreditLimit, deriveStatus } from '@/lib/gst';

const LineSchema = z.object({
  // Nullable — an ad-hoc/custom line item isn't backed by a catalog Product.
  productId: z.string().nullable(),
  name: z.string(),
  unit: z.string(),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).default(0),
});

const InvoiceInputSchema = z.object({
  customerId: z.string().min(1, 'Select a customer'),
  date: z.string(),
  due: z.string(),
  items: z.array(LineSchema).min(1, 'Add at least one line item'),
  overallDiscountType: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
  overallDiscountValue: z.coerce.number().min(0).default(0),
  markSent: z.boolean().default(false),
});

export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;
export type InvoiceActionResult = { error?: string; warning?: string; invoiceId?: string };

/**
 * The one function everything in the create-invoice flow ultimately calls.
 * Mirrors end-to-end-flow.md §2: validate → recompute totals server-side →
 * check credit limit (advisory) → transaction (claim invoice number + insert).
 */
export async function createInvoice(input: InvoiceInput): Promise<InvoiceActionResult> {
  const parsed = InvoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid invoice' };
  }
  const data = parsed.data;

  const [company, customer] = await Promise.all([
    getCompany(),
    prisma.customer.findUnique({ where: { id: data.customerId } }),
  ]);
  if (!customer) return { error: 'Customer not found' };

  const totals = computeTotals(
    data.items.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount })),
    { type: data.overallDiscountType, value: data.overallDiscountValue },
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

  // §3.4 — advisory, not blocking, matching the prototype's UI.
  let warning: string | undefined;
  if (customer.creditLimit && Number(customer.creditLimit) > 0) {
    const existingInvoices = await prisma.invoice.findMany({
      where: { customerId: customer.id },
      include: { items: true, payments: true },
    });
    const outstandingBefore = existingInvoices.reduce((sum, inv) => {
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
        customer.state
      );
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + Math.max(t.total - paid, 0);
    }, 0);
    if (isOverCreditLimit(outstandingBefore, totals.total, Number(customer.creditLimit))) {
      warning = `This will put ${customer.name} at or over their credit limit.`;
    }
  }

  // §3.3 — claim the number and insert inside one transaction so two
  // concurrent invoice creations can never collide on the same number.
  const invoice = await prisma.$transaction(async (tx) => {
    const freshCompany = await tx.company.findUniqueOrThrow({ where: { id: company.id } });
    const number = formatInvoiceNumber(freshCompany.invoicePrefix, freshCompany.invoiceFY, freshCompany.nextInvoiceNo);
    await tx.company.update({ where: { id: company.id }, data: { nextInvoiceNo: { increment: 1 } } });

    return tx.invoice.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        number,
        date: new Date(data.date),
        due: new Date(data.due),
        status: data.markSent ? 'SENT' : 'DRAFT',
        overallDiscountType: data.overallDiscountType,
        overallDiscountValue: data.overallDiscountValue,
        items: {
          create: data.items.map((l) => ({
            productId: l.productId,
            name: l.name, // snapshot — see schema.prisma comment
            unit: l.unit,
            qty: l.qty,
            rate: l.rate,
            discount: l.discount,
          })),
        },
      },
    });
  });

  revalidatePath('/invoices');
  revalidatePath('/dashboard');
  return { invoiceId: invoice.id, warning };
}

function withComputedTotals<T extends { items: any[]; overallDiscountType: any; overallDiscountValue: any; payments: any[]; status: string; due: Date; customer: { state: string } }>(
  inv: T,
  company: { cgstRate: any; sgstRate: any; igstRate: any; cgstEnabled: boolean; sgstEnabled: boolean; igstEnabled: boolean; state: string }
) {
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
    inv.customer.state
  );
  const amountPaid = inv.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  return { ...inv, computedTotal: totals.total, amountPaid, balanceDue: totals.total - amountPaid, isOverdue: inv.status !== 'PAID' && inv.due < new Date() };
}

/** Cheap aggregate (status + due date only, no items/payments/customer join)
 * for the invoice list's "Overdue · N" / "Draft · N" group labels — these
 * must reflect the full search-filtered set, not just the current page, so
 * this runs separately from the paginated row fetch below. */
export async function getInvoiceStatusCounts(search?: string) {
  const company = await getCompany();
  const rows = await prisma.invoice.findMany({
    where: {
      companyId: company.id,
      ...(search
        ? { OR: [{ number: { contains: search, mode: 'insensitive' as const } }, { customer: { name: { contains: search, mode: 'insensitive' as const } } }] }
        : {}),
    },
    select: { status: true, due: true },
  });
  const now = new Date();
  const counts: Record<string, number> = {};
  for (const inv of rows) {
    const key = inv.status !== 'PAID' && inv.due < now ? 'Overdue' : inv.status;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export type InvoiceSort = 'newest' | 'oldest' | 'amount-desc' | 'amount-asc';

/** DB-level search/filter/pagination for the Invoices list page. "Amount"
 * sort can't be a plain SQL ORDER BY — the total is computed (GST math, not
 * a stored column) — so those two sort modes load every matching invoice,
 * compute totals in JS, sort, then slice for the requested page; date-based
 * sorts (the common case) get a real skip/take query. */
export async function listInvoicesPage(opts?: { status?: string; search?: string; sort?: InvoiceSort; page?: number; pageSize?: number }) {
  const company = await getCompany();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const where = {
    companyId: company.id,
    ...(opts?.status && opts.status !== 'all' ? { status: opts.status as any } : {}),
    ...(opts?.search
      ? { OR: [{ number: { contains: opts.search, mode: 'insensitive' as const } }, { customer: { name: { contains: opts.search, mode: 'insensitive' as const } } }] }
      : {}),
  };

  if (opts?.sort === 'amount-desc' || opts?.sort === 'amount-asc') {
    const all = await prisma.invoice.findMany({ where, include: { customer: true, items: true, payments: true } });
    const withTotals = all.map((inv) => withComputedTotals(inv, company));
    withTotals.sort((a, b) => (opts.sort === 'amount-asc' ? a.computedTotal - b.computedTotal : b.computedTotal - a.computedTotal));
    const items = withTotals.slice((page - 1) * pageSize, page * pageSize);
    return { items: JSON.parse(JSON.stringify(items)), total: withTotals.length };
  }

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { customer: true, items: true, payments: true },
      orderBy: { date: opts?.sort === 'oldest' ? 'asc' : 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);
  const items = rows.map((inv) => withComputedTotals(inv, company));
  return { items: JSON.parse(JSON.stringify(items)), total };
}

export async function recordPayment(invoiceId: string, amount: number, date: string, mode?: string) {
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true, payments: true, customer: true },
  });
  const company = await getCompany();

  await prisma.payment.create({ data: { invoiceId, amount, date: new Date(date), mode } });

  const totals = computeTotals(
    invoice.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) })),
    { type: invoice.overallDiscountType, value: Number(invoice.overallDiscountValue) },
    {
      cgstRate: Number(company.cgstRate),
      sgstRate: Number(company.sgstRate),
      igstRate: Number(company.igstRate),
      cgstEnabled: company.cgstEnabled,
      sgstEnabled: company.sgstEnabled,
      igstEnabled: company.igstEnabled,
    },
    company.state,
    invoice.customer.state
  );
  const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0) + amount;
  const newStatus = deriveStatus(totals.total, totalPaid, invoice.status !== 'DRAFT');

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } });
  revalidatePath('/invoices');
  revalidatePath('/dashboard');
}

export async function deleteInvoice(id: string) {
  await prisma.invoice.delete({ where: { id } }); // cascades to items + payments
  revalidatePath('/invoices');
}

export async function duplicateInvoice(id: string) {
  const src = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });
  const company = await getCompany();

  const created = await prisma.$transaction(async (tx) => {
    const freshCompany = await tx.company.findUniqueOrThrow({ where: { id: company.id } });
    const number = formatInvoiceNumber(freshCompany.invoicePrefix, freshCompany.invoiceFY, freshCompany.nextInvoiceNo);
    await tx.company.update({ where: { id: company.id }, data: { nextInvoiceNo: { increment: 1 } } });
    const today = new Date();
    return tx.invoice.create({
      data: {
        companyId: company.id,
        customerId: src.customerId,
        number,
        date: today,
        due: today,
        status: 'DRAFT',
        overallDiscountType: src.overallDiscountType,
        overallDiscountValue: src.overallDiscountValue,
        items: { create: src.items.map((it) => ({ productId: it.productId, name: it.name, unit: it.unit, qty: it.qty, rate: it.rate, discount: it.discount })) },
      },
    });
  });
  revalidatePath('/invoices');
  return created.id;
}
