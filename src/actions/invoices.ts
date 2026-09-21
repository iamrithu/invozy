'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { computeTotals, formatInvoiceNumber, isOverCreditLimit, deriveStatus, DEFAULT_HSN } from '@/lib/gst';
import { istDayRangeUtc } from '@/lib/dates';

const LineSchema = z.object({
  // Nullable — an ad-hoc/custom line item isn't backed by a catalog Product.
  productId: z.string().nullable(),
  name: z.string(),
  unit: z.string(),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).default(0),
  // Snapshotted at creation time (CLASSIC template + e-Invoice/e-Way Bill) —
  // hsn defaults from the product's catalog HSN when not overridden per-line.
  hsn: z.string().optional().nullable(),
  batch: z.string().optional().nullable(),
  altUnit: z.string().optional().nullable(),
  altQtyPerUnit: z.coerce.number().optional().nullable(),
});

const InvoiceInputSchema = z.object({
  customerId: z.string().min(1, 'Select a customer'),
  date: z.string(),
  due: z.string(),
  items: z.array(LineSchema).min(1, 'Add at least one line item'),
  overallDiscountType: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
  overallDiscountValue: z.coerce.number().min(0).default(0),
  notes: z.string().optional().nullable(),
  deliveryInstructions: z.string().optional().nullable(),
  // Informal transport reference — see schema.prisma's comment on these
  // same fields. Independent of the GST/e-Way Bill machinery entirely.
  showTransportDetails: z.coerce.boolean().default(false),
  transportVehicleNo: z.string().optional().nullable(),
  transportDriverName: z.string().optional().nullable(),
  transportDriverPhone: z.string().optional().nullable(),
  markSent: z.boolean().default(false),
  // Records a full-amount Payment alongside the invoice so it's created
  // already PAID — for walk-in/cash-on-delivery sales where there's no real
  // "unpaid" period to track, this skips the separate record-payment step.
  markPaid: z.boolean().default(false),
  // GST config + PDF section visibility, snapshotted onto the Invoice row —
  // see the schema.prisma comment on these same fields for why. The client
  // always sends a complete set (pre-filled from Company defaults, or from
  // the invoice's own existing snapshot when editing), so these Zod
  // defaults are only a safety net, not the primary UX path.
  cgstRate: z.coerce.number().min(0).max(100).default(9),
  sgstRate: z.coerce.number().min(0).max(100).default(9),
  igstRate: z.coerce.number().min(0).max(100).default(18),
  cgstEnabled: z.coerce.boolean().default(true),
  sgstEnabled: z.coerce.boolean().default(true),
  igstEnabled: z.coerce.boolean().default(true),
  showBankDetails: z.coerce.boolean().default(true),
  showHsnSummary: z.coerce.boolean().default(false),
  showUpiQr: z.coerce.boolean().default(false),
  showGpayNumber: z.coerce.boolean().default(false),
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
  // Without the companyId check, an invoice could be created against another
  // company's customer row — leaking that customer's name/GSTIN/address into
  // this invoice and corrupting their data with a foreign invoice reference.
  if (!customer || customer.companyId !== company.id) return { error: 'Customer not found' };

  const totals = computeTotals(
    data.items.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount })),
    { type: data.overallDiscountType, value: data.overallDiscountValue },
    {
      cgstRate: data.cgstRate,
      sgstRate: data.sgstRate,
      igstRate: data.igstRate,
      cgstEnabled: data.cgstEnabled,
      sgstEnabled: data.sgstEnabled,
      igstEnabled: data.igstEnabled,
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
          cgstRate: Number(inv.cgstRate),
          sgstRate: Number(inv.sgstRate),
          igstRate: Number(inv.igstRate),
          cgstEnabled: inv.cgstEnabled,
          sgstEnabled: inv.sgstEnabled,
          igstEnabled: inv.igstEnabled,
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
        status: data.markPaid ? 'PAID' : data.markSent ? 'SENT' : 'DRAFT',
        overallDiscountType: data.overallDiscountType,
        overallDiscountValue: data.overallDiscountValue,
        notes: data.notes?.trim() || null,
        deliveryInstructions: data.deliveryInstructions?.trim() || null,
        showTransportDetails: data.showTransportDetails,
        transportVehicleNo: data.transportVehicleNo?.trim() || null,
        transportDriverName: data.transportDriverName?.trim() || null,
        transportDriverPhone: data.transportDriverPhone?.trim() || null,
        // Snapshotted, not re-read from Company later — see schema.prisma.
        cgstRate: data.cgstRate,
        sgstRate: data.sgstRate,
        igstRate: data.igstRate,
        cgstEnabled: data.cgstEnabled,
        sgstEnabled: data.sgstEnabled,
        igstEnabled: data.igstEnabled,
        showBankDetails: data.showBankDetails,
        showHsnSummary: data.showHsnSummary,
        showUpiQr: data.showUpiQr,
        showGpayNumber: data.showGpayNumber,
        items: {
          create: data.items.map((l) => ({
            productId: l.productId,
            name: l.name, // snapshot — see schema.prisma comment
            unit: l.unit,
            qty: l.qty,
            rate: l.rate,
            discount: l.discount,
            // Persisted (not just a display-time fallback — see invoice-sheet-classic.tsx)
            // so the completeness checklist and any real e-Invoice/e-Way Bill
            // submission see a real code instead of a missing one.
            hsn: l.hsn?.trim() || company.defaultHsn || DEFAULT_HSN,
            batch: l.batch,
            altUnit: l.altUnit,
            altQtyPerUnit: l.altQtyPerUnit,
          })),
        },
        ...(data.markPaid ? { payments: { create: { amount: totals.total, date: new Date(data.date), mode: 'Cash' } } } : {}),
      },
    });
  });

  revalidatePath('/invoices');
  revalidatePath('/dashboard');
  return { invoiceId: invoice.id, warning };
}

/**
 * Full edit of an existing invoice — same validation/totals/credit-limit flow
 * as createInvoice, but updates the invoice row + replaces its items in
 * place instead of claiming a new number. Editable any time up to (not
 * including) PAID — once fully paid it's treated as settled/closed, the
 * same real-world constraint most billing software enforces past that
 * point (recordPayment/duplicateInvoice are the supported paths after).
 */
export async function updateInvoice(invoiceId: string, input: InvoiceInput): Promise<InvoiceActionResult> {
  const parsed = InvoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid invoice' };
  }
  const data = parsed.data;

  const [company, existing, customer] = await Promise.all([
    getCompany(),
    prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } }),
    prisma.customer.findUnique({ where: { id: data.customerId } }),
  ]);
  if (!existing || existing.companyId !== company.id) return { error: 'Invoice not found' };
  if (existing.status === 'PAID') return { error: 'This invoice is already paid in full and can no longer be edited' };
  if (!customer || customer.companyId !== company.id) return { error: 'Customer not found' };
  // Real money already recorded (e.g. a PARTIALLY_PAID invoice) — markPaid
  // below must only top up the remaining balance, never re-insert the full
  // total as a second payment on top of what's already on file.
  const alreadyPaid = existing.payments.reduce((s, p) => s + Number(p.amount), 0);

  // Once an e-Invoice IRN has been filed with NIC, its tax amounts are
  // locked with the government (there's no amend API, only cancel-within-
  // 24h) — a GST-config edit here would desync the locally displayed/
  // stored totals from what was actually filed. Ignore whatever the client
  // submitted for these 8 fields in that case and keep the invoice's
  // existing snapshot, regardless of what the (should-be-disabled) client
  // UI sent — this is a server-side guard, not just a UI affordance.
  const gst = existing.irn
    ? {
        cgstRate: Number(existing.cgstRate),
        sgstRate: Number(existing.sgstRate),
        igstRate: Number(existing.igstRate),
        cgstEnabled: existing.cgstEnabled,
        sgstEnabled: existing.sgstEnabled,
        igstEnabled: existing.igstEnabled,
        showBankDetails: existing.showBankDetails,
        showHsnSummary: existing.showHsnSummary,
        showUpiQr: existing.showUpiQr,
        showGpayNumber: existing.showGpayNumber,
      }
    : {
        cgstRate: data.cgstRate,
        sgstRate: data.sgstRate,
        igstRate: data.igstRate,
        cgstEnabled: data.cgstEnabled,
        sgstEnabled: data.sgstEnabled,
        igstEnabled: data.igstEnabled,
        showBankDetails: data.showBankDetails,
        showHsnSummary: data.showHsnSummary,
        showUpiQr: data.showUpiQr,
        showGpayNumber: data.showGpayNumber,
      };

  const totals = computeTotals(
    data.items.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount })),
    { type: data.overallDiscountType, value: data.overallDiscountValue },
    {
      cgstRate: gst.cgstRate,
      sgstRate: gst.sgstRate,
      igstRate: gst.igstRate,
      cgstEnabled: gst.cgstEnabled,
      sgstEnabled: gst.sgstEnabled,
      igstEnabled: gst.igstEnabled,
    },
    company.state,
    customer.state
  );

  let warning: string | undefined;
  if (customer.creditLimit && Number(customer.creditLimit) > 0) {
    // Excludes this invoice's own (pre-edit) record — otherwise its old
    // total would double-count against the newly edited total below.
    const existingInvoices = await prisma.invoice.findMany({
      where: { customerId: customer.id, id: { not: invoiceId } },
      include: { items: true, payments: true },
    });
    const outstandingBefore = existingInvoices.reduce((sum, inv) => {
      const t = computeTotals(
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
        customer.state
      );
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + Math.max(t.total - paid, 0);
    }, 0);
    if (isOverCreditLimit(outstandingBefore, totals.total, Number(customer.creditLimit))) {
      warning = `This will put ${customer.name} at or over their credit limit.`;
    }
  }

  // Only top up the remaining balance — inserting the full total again would
  // double-count whatever's already been recorded against this invoice
  // (e.g. a PARTIALLY_PAID one). And the resulting status is *derived*, not
  // just taken from which Save button was clicked: real money already on
  // file must promote a plain "Save as draft"/"Save & mark as sent" click
  // to at least PARTIALLY_PAID rather than silently erasing that a partial
  // payment exists — deriveStatus (below) already encodes exactly that
  // precedence, same as recordPayment's own status transitions.
  const topUp = data.markPaid ? Math.max(totals.total - alreadyPaid, 0) : 0;
  const newStatus = deriveStatus(totals.total, alreadyPaid + topUp, data.markSent || data.markPaid);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: {
        customerId: customer.id,
        date: new Date(data.date),
        due: new Date(data.due),
        status: newStatus,
        overallDiscountType: data.overallDiscountType,
        overallDiscountValue: data.overallDiscountValue,
        notes: data.notes?.trim() || null,
        deliveryInstructions: data.deliveryInstructions?.trim() || null,
        showTransportDetails: data.showTransportDetails,
        transportVehicleNo: data.transportVehicleNo?.trim() || null,
        transportDriverName: data.transportDriverName?.trim() || null,
        transportDriverPhone: data.transportDriverPhone?.trim() || null,
        // `gst` above already resolves to the invoice's existing (locked)
        // snapshot when an IRN exists, or the submitted override otherwise.
        cgstRate: gst.cgstRate,
        sgstRate: gst.sgstRate,
        igstRate: gst.igstRate,
        cgstEnabled: gst.cgstEnabled,
        sgstEnabled: gst.sgstEnabled,
        igstEnabled: gst.igstEnabled,
        showBankDetails: gst.showBankDetails,
        showHsnSummary: gst.showHsnSummary,
        showUpiQr: gst.showUpiQr,
        showGpayNumber: gst.showGpayNumber,
        items: {
          create: data.items.map((l) => ({
            productId: l.productId,
            name: l.name,
            unit: l.unit,
            qty: l.qty,
            rate: l.rate,
            discount: l.discount,
            hsn: l.hsn?.trim() || company.defaultHsn || DEFAULT_HSN,
            batch: l.batch,
            altUnit: l.altUnit,
            altQtyPerUnit: l.altQtyPerUnit,
          })),
        },
        ...(topUp > 0.004 ? { payments: { create: { amount: topUp, date: new Date(data.date), mode: 'Cash' } } } : {}),
      },
    });
  });

  revalidatePath('/invoices');
  revalidatePath('/dashboard');
  revalidatePath(`/invoices/${invoiceId}`);
  return { invoiceId: updated.id, warning };
}

function withComputedTotals<
  T extends {
    items: any[];
    overallDiscountType: any;
    overallDiscountValue: any;
    payments: any[];
    status: string;
    due: Date;
    customer: { state: string };
    cgstRate: any;
    sgstRate: any;
    igstRate: any;
    cgstEnabled: boolean;
    sgstEnabled: boolean;
    igstEnabled: boolean;
  },
>(inv: T, company: { state: string }) {
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
  const amountPaid = inv.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  return { ...inv, computedTotal: totals.total, amountPaid, balanceDue: totals.total - amountPaid, isOverdue: inv.status !== 'PAID' && inv.due < new Date() };
}

/** Cheap aggregate (status + due date only, no items/payments/customer join)
 * for the invoice list's "Overdue · N" / "Draft · N" group labels — these
 * must reflect the full search-*and-date*-filtered set, not just the
 * current page, so this runs separately from the paginated row fetch below
 * and takes the same `dateFrom`/`dateTo` it does. */
export async function getInvoiceStatusCounts(search?: string, dateFrom?: string, dateTo?: string) {
  const company = await getCompany();
  const rows = await prisma.invoice.findMany({
    where: {
      companyId: company.id,
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' as const } },
              { customer: { name: { contains: search, mode: 'insensitive' as const } } },
              { customer: { shopName: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
      ...(dateFrom || dateTo
        ? { date: { ...(dateFrom ? istDayRangeUtc(dateFrom) : {}), ...(dateTo ? { lt: istDayRangeUtc(dateTo).lt } : {}) } }
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
export async function listInvoicesPage(opts?: { status?: string; search?: string; sort?: InvoiceSort; page?: number; pageSize?: number; dateFrom?: string; dateTo?: string }) {
  const company = await getCompany();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const where = {
    companyId: company.id,
    ...(opts?.status && opts.status !== 'all' ? { status: opts.status as any } : {}),
    ...(opts?.search
      ? {
          OR: [
            { number: { contains: opts.search, mode: 'insensitive' as const } },
            { customer: { name: { contains: opts.search, mode: 'insensitive' as const } } },
            { customer: { shopName: { contains: opts.search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    // `dateFrom`/`dateTo` are IST calendar dates (YYYY-MM-DD), not UTC —
    // see src/lib/dates.ts for why that distinction matters for an
    // India-only app running on a UTC server.
    ...(opts?.dateFrom || opts?.dateTo
      ? { date: { ...(opts.dateFrom ? istDayRangeUtc(opts.dateFrom) : {}), ...(opts.dateTo ? { lt: istDayRangeUtc(opts.dateTo).lt } : {}) } }
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
  const [invoice, company] = await Promise.all([
    prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { items: true, payments: true, customer: true },
    }),
    getCompany(),
  ]);
  // Without this, any logged-in user could record a fake payment against —
  // and flip the status of — another company's invoice.
  if (invoice.companyId !== company.id) throw new Error('Invoice not found');

  await prisma.payment.create({ data: { invoiceId, amount, date: new Date(date), mode } });

  const totals = computeTotals(
    invoice.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) })),
    { type: invoice.overallDiscountType, value: Number(invoice.overallDiscountValue) },
    {
      cgstRate: Number(invoice.cgstRate),
      sgstRate: Number(invoice.sgstRate),
      igstRate: Number(invoice.igstRate),
      cgstEnabled: invoice.cgstEnabled,
      sgstEnabled: invoice.sgstEnabled,
      igstEnabled: invoice.igstEnabled,
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
  const [invoice, company] = await Promise.all([prisma.invoice.findUniqueOrThrow({ where: { id } }), getCompany()]);
  // Without this, any logged-in user could delete any other company's
  // invoice (cascading to its items + payments) just by knowing its id.
  if (invoice.companyId !== company.id) throw new Error('Invoice not found');
  await prisma.invoice.delete({ where: { id } }); // cascades to items + payments
  revalidatePath('/invoices');
}

export async function duplicateInvoice(id: string) {
  const [src, company] = await Promise.all([prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } }), getCompany()]);
  // Without this, any logged-in user could read — and copy into their own
  // company — another company's full invoice (items, discounts, customer
  // reference).
  if (src.companyId !== company.id) throw new Error('Invoice not found');

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
        notes: src.notes,
        deliveryInstructions: src.deliveryInstructions,
        showTransportDetails: src.showTransportDetails,
        transportVehicleNo: src.transportVehicleNo,
        transportDriverName: src.transportDriverName,
        transportDriverPhone: src.transportDriverPhone,
        // A duplicate clones the source's GST config exactly — not
        // re-derived from (possibly since-changed) current Company
        // settings — same "duplicate this exact invoice" semantics as
        // everything else copied here.
        cgstRate: src.cgstRate,
        sgstRate: src.sgstRate,
        igstRate: src.igstRate,
        cgstEnabled: src.cgstEnabled,
        sgstEnabled: src.sgstEnabled,
        igstEnabled: src.igstEnabled,
        showBankDetails: src.showBankDetails,
        showHsnSummary: src.showHsnSummary,
        showUpiQr: src.showUpiQr,
        showGpayNumber: src.showGpayNumber,
        items: {
          create: src.items.map((it) => ({
            productId: it.productId,
            name: it.name,
            unit: it.unit,
            qty: it.qty,
            rate: it.rate,
            discount: it.discount,
            hsn: it.hsn,
            batch: it.batch,
            altUnit: it.altUnit,
            altQtyPerUnit: it.altQtyPerUnit,
          })),
        },
      },
    });
  });
  revalidatePath('/invoices');
  return created.id;
}

const DispatchDetailsSchema = z.object({
  deliveryNote: z.string().optional().nullable(),
  deliveryNoteDate: z.string().optional().nullable(),
  buyersOrderNo: z.string().optional().nullable(),
  buyersOrderDate: z.string().optional().nullable(),
  dispatchDocNo: z.string().optional().nullable(),
  otherReferences: z.string().optional().nullable(),
  billOfLadingNo: z.string().optional().nullable(),
  destination: z.string().optional().nullable(),
});

/** The standard Tally-style reference fields on the CLASSIC template's
 * header grid (Delivery Note, Buyer's Order No, Dispatch Doc No, Bill of
 * Lading/LR-RR No, Other References, Destination) — pure print/reference
 * fields, no GST math or NIC payload depends on them, so this is a plain
 * update with no recompute/side effects. */
export async function updateDispatchDetails(invoiceId: string, input: z.infer<typeof DispatchDetailsSchema>): Promise<{ error?: string }> {
  const parsed = DispatchDetailsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid dispatch details' };

  const company = await getCompany();
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.companyId !== company.id) return { error: 'Invoice not found.' };

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      deliveryNote: parsed.data.deliveryNote,
      deliveryNoteDate: parsed.data.deliveryNoteDate ? new Date(parsed.data.deliveryNoteDate) : null,
      buyersOrderNo: parsed.data.buyersOrderNo,
      buyersOrderDate: parsed.data.buyersOrderDate ? new Date(parsed.data.buyersOrderDate) : null,
      dispatchDocNo: parsed.data.dispatchDocNo,
      otherReferences: parsed.data.otherReferences,
      billOfLadingNo: parsed.data.billOfLadingNo,
      destination: parsed.data.destination,
    },
  });
  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}
