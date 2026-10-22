'use server';

import { z } from 'zod';
import type { Prisma, InvoiceStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { requireUser } from '@/lib/session';
import { computeTotals, formatInvoiceNumber, isOverCreditLimit, deriveStatus, DEFAULT_HSN } from '@/lib/gst';
import { totalsColumns, customerOutstanding } from '@/lib/invoice-totals';
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

  // The outstanding-balance lookup only matters when the customer has a
  // credit limit, but it's one indexed aggregate — running it alongside
  // the other two reads is cheaper than a second round trip afterwards.
  const [company, customer, outstandingBefore] = await Promise.all([
    getCompany(),
    prisma.customer.findUnique({ where: { id: data.customerId } }),
    customerOutstanding(data.customerId),
  ]);
  if (!customer) return { error: 'Customer not found' };

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
  const warning = isOverCreditLimit(outstandingBefore, totals.total, Number(customer.creditLimit))
    ? `This will put ${customer.name} at or over their credit limit.`
    : undefined;

  // §3.3 — claim the number and insert inside one transaction so two
  // concurrent invoice creations can never collide on the same number.
  const invoice = await prisma.$transaction(async (tx) => {
    const number = await claimInvoiceNumber(tx, company.id);
    return tx.invoice.create({
      data: {
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
        ...totalsColumns(totals),
        amountPaid: data.markPaid ? totals.total : 0,
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

/** Atomically takes the company's next invoice number — the UPDATE's row
 * lock serializes concurrent callers, and reading the incremented value back
 * from the same statement means no separate SELECT that two transactions
 * could both see before either increments. Must run inside the transaction
 * that inserts the invoice, so a failed insert releases the number. */
async function claimInvoiceNumber(tx: Pick<typeof prisma, 'company'>, companyId: string) {
  const c = await tx.company.update({
    where: { id: companyId },
    data: { nextInvoiceNo: { increment: 1 } },
    select: { invoicePrefix: true, invoiceFY: true, nextInvoiceNo: true },
  });
  return formatInvoiceNumber(c.invoicePrefix, c.invoiceFY, c.nextInvoiceNo - 1);
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

  const [company, existing, customer, outstandingBefore] = await Promise.all([
    getCompany(),
    prisma.invoice.findUnique({ where: { id: invoiceId } }),
    prisma.customer.findUnique({ where: { id: data.customerId } }),
    // Excludes this invoice's own (pre-edit) record — otherwise its old
    // total would double-count against the newly edited total below.
    customerOutstanding(data.customerId, invoiceId),
  ]);
  if (!existing) return { error: 'Invoice not found' };
  if (existing.status === 'PAID') return { error: 'This invoice is already paid in full and can no longer be edited' };
  if (!customer) return { error: 'Customer not found' };
  // Real money already recorded (e.g. a PARTIALLY_PAID invoice) — markPaid
  // below must only top up the remaining balance, never re-insert the full
  // total as a second payment on top of what's already on file.
  const alreadyPaid = Number(existing.amountPaid);

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

  const warning = isOverCreditLimit(outstandingBefore, totals.total, Number(customer.creditLimit))
    ? `This will put ${customer.name} at or over their credit limit.`
    : undefined;

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
        ...totalsColumns(totals),
        amountPaid: alreadyPaid + (topUp > 0.004 ? topUp : 0),
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

/** Only the columns the Invoices list/detail sheet actually render — totals
 * come from the stored columns (see schema.prisma), so no items join is
 * needed, just a count. */
const LIST_SELECT = {
  id: true,
  number: true,
  date: true,
  due: true,
  status: true,
  total: true,
  amountPaid: true,
  interState: true,
  customer: { select: { name: true, shopName: true, state: true } },
  payments: { select: { amount: true, date: true, mode: true }, orderBy: { date: 'asc' } },
  _count: { select: { items: true } },
} satisfies Prisma.InvoiceSelect;

function toListRow(inv: Prisma.InvoiceGetPayload<{ select: typeof LIST_SELECT }>, now: Date) {
  const total = Number(inv.total);
  const amountPaid = Number(inv.amountPaid);
  const { _count, total: _t, interState, ...rest } = inv;
  return {
    ...rest,
    payments: inv.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    computedTotal: total,
    amountPaid,
    balanceDue: total - amountPaid,
    isOverdue: inv.status !== 'PAID' && inv.due < now,
    // Inter-state (IGST) vs intra-state (CGST+SGST) — for the GST type
    // filter on the Invoices list.
    useIgst: interState,
    itemCount: _count.items,
  };
}

type InvoiceWhereFilters = Omit<InvoiceListFilters, 'sort' | 'page' | 'pageSize'>;

/** One WHERE for the Invoices list and its status counts, so the two can
 * never disagree. Every filter — including amount range and GST type —
 * runs in Postgres against the stored totals columns. */
function invoiceWhere(f: InvoiceWhereFilters): Prisma.InvoiceWhereInput {
  return {
    ...(f.status && f.status !== 'all' ? { status: f.status as InvoiceStatus } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.search
      ? {
          OR: [
            { number: { contains: f.search, mode: 'insensitive' } },
            { customer: { name: { contains: f.search, mode: 'insensitive' } } },
            { customer: { shopName: { contains: f.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
    // `dateFrom`/`dateTo` are IST calendar dates (YYYY-MM-DD), not UTC —
    // see src/lib/dates.ts for why that distinction matters for an
    // India-only app running on a UTC server.
    ...(f.dateFrom || f.dateTo
      ? { date: { ...(f.dateFrom ? { gte: istDayRangeUtc(f.dateFrom).gte } : {}), ...(f.dateTo ? { lt: istDayRangeUtc(f.dateTo).lt } : {}) } }
      : {}),
    ...(f.amountMin != null || f.amountMax != null
      ? { total: { ...(f.amountMin != null ? { gte: f.amountMin } : {}), ...(f.amountMax != null ? { lte: f.amountMax } : {}) } }
      : {}),
    ...(f.gstType === 'intra' ? { interState: false } : f.gstType === 'inter' ? { interState: true } : {}),
  };
}

/** Counts for the invoice list's "Overdue · N" / "Draft · N" group labels —
 * these must reflect the full filtered set, not just the current page, so
 * this runs separately from the paginated row fetch and takes the same
 * filters (everything except status/sort/page, which don't affect counts).
 * Two GROUP BYs instead of fetching rows: an overdue invoice counts under
 * "Overdue" rather than its own status, so the overdue counts are
 * subtracted back out of each status. */
export async function getInvoiceStatusCounts(
  search?: string,
  dateFrom?: string,
  dateTo?: string,
  opts?: { customerId?: string; amountMin?: number; amountMax?: number; gstType?: 'all' | 'intra' | 'inter' }
) {
  await requireUser();
  const where = invoiceWhere({ search, dateFrom, dateTo, ...opts });
  const [all, overdue] = await Promise.all([
    prisma.invoice.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ['status'], where: { AND: [where, { status: { not: 'PAID' }, due: { lt: new Date() } }] }, _count: { _all: true } }),
  ]);
  const counts: Record<string, number> = {};
  for (const row of all) counts[row.status] = row._count._all;
  for (const row of overdue) {
    counts[row.status] -= row._count._all;
    counts.Overdue = (counts.Overdue ?? 0) + row._count._all;
  }
  for (const key of Object.keys(counts)) if (counts[key] === 0) delete counts[key];
  return counts;
}

export type InvoiceSort = 'newest' | 'oldest' | 'amount-desc' | 'amount-asc';

export type InvoiceListFilters = {
  status?: string;
  search?: string;
  sort?: InvoiceSort;
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  amountMin?: number;
  amountMax?: number;
  /** Inter-state (IGST) vs intra-state (CGST+SGST) — the stored
   * Invoice.interState column. */
  gstType?: 'all' | 'intra' | 'inter';
};

const SORT_ORDER: Record<InvoiceSort, Prisma.InvoiceOrderByWithRelationInput[]> = {
  // `number` breaks ties between same-day invoices, so paging through a
  // busy day never repeats or skips a row.
  newest: [{ date: 'desc' }, { number: 'desc' }],
  oldest: [{ date: 'asc' }, { number: 'asc' }],
  'amount-desc': [{ total: 'desc' }, { date: 'desc' }, { number: 'desc' }],
  'amount-asc': [{ total: 'asc' }, { date: 'desc' }, { number: 'desc' }],
};

/** DB-level search/filter/sort/pagination for the Invoices list page — one
 * skip/take query plus a count, for every filter and sort combination. */
export async function listInvoicesPage(opts?: InvoiceListFilters) {
  await requireUser();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const where = invoiceWhere(opts ?? {});

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: LIST_SELECT,
      orderBy: SORT_ORDER[opts?.sort ?? 'newest'],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);
  const now = new Date();
  return { items: JSON.parse(JSON.stringify(rows.map((inv) => toListRow(inv, now)))), total };
}

export async function recordPayment(invoiceId: string, amount: number, date: string, mode?: string) {
  await requireUser();
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { total: true, amountPaid: true, status: true } });
  if (!invoice) throw new Error('Invoice not found');

  const totalPaid = Number(invoice.amountPaid) + amount;
  const newStatus = deriveStatus(Number(invoice.total), totalPaid, invoice.status !== 'DRAFT');

  // One statement: the payment row, the running amountPaid, and the status
  // all land together or not at all.
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: newStatus, amountPaid: { increment: amount }, payments: { create: { amount, date: new Date(date), mode } } },
  });
  revalidatePath('/invoices');
  revalidatePath('/dashboard');
}

export async function deleteInvoice(id: string) {
  await requireUser();
  const { count } = await prisma.invoice.deleteMany({ where: { id } }); // cascades to items + payments
  if (!count) throw new Error('Invoice not found');
  revalidatePath('/invoices');
  revalidatePath('/dashboard');
}

export async function duplicateInvoice(id: string) {
  const [src, company] = await Promise.all([prisma.invoice.findUnique({ where: { id }, include: { items: true } }), getCompany()]);
  if (!src) throw new Error('Invoice not found');

  const created = await prisma.$transaction(async (tx) => {
    const number = await claimInvoiceNumber(tx, company.id);
    const today = new Date();
    return tx.invoice.create({
      data: {
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
        // Same lines, discount, GST snapshot, and customer — so the same
        // stored totals; nothing has been paid on the copy yet.
        taxable: src.taxable,
        cgst: src.cgst,
        sgst: src.sgst,
        igst: src.igst,
        total: src.total,
        interState: src.interState,
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
  revalidatePath('/dashboard');
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

  await requireUser();
  const { count } = await prisma.invoice.updateMany({
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
  if (!count) return { error: 'Invoice not found.' };
  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}
