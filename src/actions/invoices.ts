'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import type { Prisma, InvoiceStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma, type Tx } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { requireOwner, requireUser } from '@/lib/session';
import { computeTotals, formatInvoiceNumber, isOverCreditLimit, deriveStatus, DEFAULT_HSN, fmtInr } from '@/lib/gst';
import { totalsColumns, customerOutstanding } from '@/lib/invoice-totals';
import { istDayRangeUtc, todayIst } from '@/lib/dates';
import { toActionError } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { invoiceHeld, lineStockQuantities, postStockChanges, sumByProduct } from '@/lib/stock';
import { formatStock } from '@/lib/stock-units';
import { schedulePdfBuild } from '@/lib/invoice-pdf';
import { invoiceShareToken } from '@/lib/signed-token';
import { deleteUploadedImage } from '@/lib/uploads';

const LineSchema = z.object({
  // Nullable — an ad-hoc/custom line item isn't backed by a catalog Product.
  productId: z.string().nullable(),
  name: z.string().trim().min(1, 'needs a name'),
  unit: z.string(),
  qty: z.coerce.number().positive('quantity must be more than zero'),
  rate: z.coerce.number().min(0, "rate can't be negative"),
  discount: z.coerce.number().min(0, 'discount must be between 0 and 100%').max(100, 'discount must be between 0 and 100%').default(0),
  // Snapshotted at creation time (CLASSIC template + e-Invoice/e-Way Bill) —
  // hsn defaults from the product's catalog HSN when not overridden per-line.
  hsn: z.string().optional().nullable(),
  batch: z.string().optional().nullable(),
  altUnit: z.string().optional().nullable(),
  altQtyPerUnit: z.coerce.number().optional().nullable(),
});

const InvoiceInputSchema = z
  .object({
    customerId: z.string().min(1, 'Select a customer'),
    date: z.string(),
    due: z.string(),
    items: z.array(LineSchema).min(1, 'Add at least one line item'),
    overallDiscountType: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
    overallDiscountValue: z.coerce.number().min(0, "The bill discount can't be negative").default(0),
    notes: z.string().optional().nullable(),
    deliveryInstructions: z.string().optional().nullable(),
    // Informal transport reference — see schema.prisma's comment on these
    // same fields. Independent of the GST/e-Way Bill machinery entirely.
    showTransportDetails: z.coerce.boolean().default(false),
    transportVehicleNo: z.string().optional().nullable(),
    transportDriverName: z.string().optional().nullable(),
    transportDriverPhone: z.string().optional().nullable(),
    markSent: z.boolean().default(false),
    // Records a payment for whatever is still due alongside the save, so a
    // walk-in/cash-on-delivery sale is created already PAID.
    markPaid: z.boolean().default(false),
    paymentMode: z.string().optional().nullable(),
    // Owner only: save even though a tracked product would go below zero
    // (the count is wrong and the goods really are there). See postStockChanges.
    allowNegativeStock: z.boolean().default(false),
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
  })
  .refine((d) => d.overallDiscountType !== 'PERCENT' || d.overallDiscountValue <= 100, {
    message: 'The bill discount must be between 0 and 100%',
    path: ['overallDiscountValue'],
  });

export type InvoiceInput = z.input<typeof InvoiceInputSchema>;
export type InvoiceActionResult = { error?: string; warning?: string; invoiceId?: string; number?: string; status?: InvoiceStatus };

/** Zod's first issue as a sentence a person can act on — "Line 3 (CM -
 * Cassata): discount must be between 0 and 100%" instead of "Number must be
 * less than or equal to 100". */
function parseInvoiceInput(input: InvoiceInput) {
  const parsed = InvoiceInputSchema.safeParse(input);
  if (parsed.success) return { data: parsed.data };
  const issue = parsed.error.issues[0];
  if (issue && issue.path[0] === 'items' && typeof issue.path[1] === 'number') {
    const i = issue.path[1];
    const name = input.items?.[i]?.name;
    return { error: `Line ${i + 1}${name ? ` (${name})` : ''}: ${issue.message}` };
  }
  return { error: issue?.message ?? 'Check the invoice and try again.' };
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

/** Same claim-in-transaction pattern as claimInvoiceNumber, for the
 * sequential number printed on a payment receipt. */
async function claimReceiptNumber(tx: Pick<typeof prisma, 'company'>, companyId: string) {
  const c = await tx.company.update({
    where: { id: companyId },
    data: { nextReceiptNo: { increment: 1 } },
    select: { receiptPrefix: true, invoiceFY: true, nextReceiptNo: true },
  });
  return formatInvoiceNumber(c.receiptPrefix, c.invoiceFY, c.nextReceiptNo - 1);
}

// Interactive transactions default to a 5s budget; an invoice save now
// also posts one stock movement per tracked product, so give a slow Neon
// wake-up room before Prisma aborts a perfectly good save.
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

/** Stored lines with their main-unit stock quantity. Lines saved before
 * stock tracking existed carry no stockQty snapshot, so it's derived from
 * their qty/unit here — otherwise the "before" side of a stock difference
 * would treat them as consuming nothing. */
async function withStockQty(tx: Tx, items: { productId: string | null; qty: unknown; unit: string; stockQty: unknown }[]) {
  if (!items.some((it) => it.productId && it.stockQty == null)) return items.map((it) => ({ productId: it.productId, stockQty: it.stockQty }));
  const derived = await lineStockQuantities(tx, items.map((it) => ({ productId: it.productId, qty: Number(it.qty), unit: it.unit })));
  return items.map((it, i) => ({ productId: it.productId, stockQty: it.stockQty ?? derived[i] }));
}

function itemRows(items: z.infer<typeof LineSchema>[], stockQtys: (number | null)[], defaultHsn: string) {
  return items.map((l, i) => ({
    productId: l.productId,
    name: l.name, // snapshot — see schema.prisma comment
    unit: l.unit,
    qty: l.qty,
    rate: l.rate,
    discount: l.discount,
    // Persisted (not just a display-time fallback) so the completeness
    // checklist and any real e-Invoice/e-Way Bill submission see a real code.
    hsn: l.hsn?.trim() || defaultHsn || DEFAULT_HSN,
    batch: l.batch,
    altUnit: l.altUnit,
    altQtyPerUnit: l.altQtyPerUnit,
    stockQty: stockQtys[i],
  }));
}

/**
 * The one function everything in the create-invoice flow ultimately calls:
 * validate → recompute totals server-side → check credit limit (advisory) →
 * transaction (claim invoice number + insert + take stock out).
 */
export async function createInvoice(input: InvoiceInput): Promise<InvoiceActionResult> {
  const parsed = parseInvoiceInput(input);
  if ('error' in parsed) return { error: parsed.error };
  const data = parsed.data;

  try {
    // The outstanding-balance lookup only matters when the customer has a
    // credit limit, but it's one indexed aggregate — running it alongside
    // the other reads is cheaper than a second round trip afterwards.
    const [user, company, customer, outstandingBefore] = await Promise.all([
      requireUser(),
      getCompany(),
      prisma.customer.findUnique({ where: { id: data.customerId } }),
      customerOutstanding(data.customerId),
    ]);
    if (!customer) return { error: 'Customer not found' };
    if (!customer.active) return { error: `${customer.shopName || customer.name} is disabled. Enable them in Customers to bill them again.` };
    if (data.allowNegativeStock && user.role !== 'OWNER') return { error: 'Only the owner can save an invoice with stock below zero.' };

    const totals = computeTotals(
      data.items.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount })),
      { type: data.overallDiscountType, value: data.overallDiscountValue },
      data,
      company.state,
      customer.state
    );

    const warning = isOverCreditLimit(outstandingBefore, totals.total, Number(customer.creditLimit))
      ? `This will put ${customer.name} at or over their credit limit.`
      : undefined;

    const status: InvoiceStatus = data.markPaid ? 'PAID' : data.markSent ? 'SENT' : 'DRAFT';

    const invoice = await prisma.$transaction(async (tx) => {
      const number = await claimInvoiceNumber(tx, company.id);
      const stockQtys = await lineStockQuantities(tx, data.items);
      const receiptNo = data.markPaid ? await claimReceiptNumber(tx, company.id) : null;
      const created = await tx.invoice.create({
        data: {
          customerId: customer.id,
          number,
          date: new Date(data.date),
          due: new Date(data.due),
          status,
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
          items: { create: itemRows(data.items, stockQtys, company.defaultHsn) },
          ...(data.markPaid
            ? { payments: { create: { amount: totals.total, date: new Date(data.date), mode: data.paymentMode || 'Cash', receiptNo } } }
            : {}),
        },
      });
      await postStockChanges(tx, {
        direction: 'out',
        before: new Map(),
        // Drafts included — saving an invoice in any status takes its stock.
        after: sumByProduct(data.items.map((l, i) => ({ productId: l.productId, stockQty: stockQtys[i] }))),
        increaseType: 'SALE',
        decreaseType: 'SALE_RETURN',
        meta: { invoiceId: created.id, invoiceNumber: number, userId: user.id, date: new Date(data.date), note: data.allowNegativeStock ? 'Saved with stock below zero' : null },
        enforce: !data.allowNegativeStock,
      });
      return created;
    }, TX_OPTIONS);

    await logActivity({
      userId: user.id,
      action: 'invoice.create',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: `Created ${invoice.number} for ${customer.shopName || customer.name} — ${fmtInr(totals.total)} (${status.toLowerCase().replace('_', ' ')})`,
    });
    schedulePdfBuild(invoice.id);
    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    return { invoiceId: invoice.id, number: invoice.number, status: invoice.status, warning };
  } catch (e) {
    return toActionError(e);
  }
}

/**
 * Full edit of an existing invoice — same validation/totals/credit-limit
 * flow as createInvoice, but updates the invoice row + replaces its items in
 * place instead of claiming a new number. Allowed in every status,
 * including PAID: the status is re-derived from what's been paid against
 * the new total, and stock moves by exactly what the edit changed.
 */
export async function updateInvoice(invoiceId: string, input: InvoiceInput): Promise<InvoiceActionResult> {
  const parsed = parseInvoiceInput(input);
  if ('error' in parsed) return { error: parsed.error };
  const data = parsed.data;

  try {
    const [user, company, existing, customer, outstandingBefore] = await Promise.all([
      requireUser(),
      getCompany(),
      prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: { select: { productId: true, qty: true, unit: true, stockQty: true } },
          creditNotes: { select: { number: true, items: { select: { productId: true, name: true, unit: true, qty: true } } } },
        },
      }),
      prisma.customer.findUnique({ where: { id: data.customerId } }),
      // Excludes this invoice's own (pre-edit) record — otherwise its old
      // total would double-count against the newly edited total below.
      customerOutstanding(data.customerId, invoiceId),
    ]);
    if (!existing) return { error: 'Invoice not found' };
    if (!customer) return { error: 'Customer not found' };
    if (data.allowNegativeStock && user.role !== 'OWNER') return { error: 'Only the owner can save an invoice with stock below zero.' };
    // Switching an invoice *to* a disabled customer is blocked; an invoice
    // that already belongs to one stays editable.
    if (!customer.active && customer.id !== existing.customerId) {
      return { error: `${customer.shopName || customer.name} is disabled. Enable them in Customers to bill them again.` };
    }
    const alreadyPaid = Number(existing.amountPaid);

    // Goods already credited back on a credit note can't be edited away
    // from the invoice — the credit note's own stock return and money would
    // then count them a second time. Delete the credit note first.
    const credited = new Map<string, { qty: number; name: string; unit: string; note: string }>();
    for (const cn of existing.creditNotes) {
      for (const it of cn.items) {
        const key = `${it.productId ?? it.name}|${it.unit.trim().toLowerCase()}`;
        const prev = credited.get(key);
        credited.set(key, { qty: (prev?.qty ?? 0) + Number(it.qty), name: it.name, unit: it.unit, note: cn.number });
      }
    }
    for (const [key, c] of credited) {
      const billed = data.items
        .filter((l) => `${l.productId ?? l.name}|${l.unit.trim().toLowerCase()}` === key)
        .reduce((sum, l) => sum + l.qty, 0);
      if (billed + 1e-6 < c.qty) {
        return { error: `${c.name}: ${c.qty} ${c.unit} was already credited on ${c.note}, so the invoice can't go below that. Delete the credit note first if this needs to change.` };
      }
    }

    // Once an e-Invoice IRN has been filed with NIC, its tax amounts are
    // locked with the government (there's no amend API, only cancel-within-
    // 24h) — keep the invoice's existing GST snapshot whatever the client
    // sent. A server-side guard, not just a UI affordance.
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
      gst,
      company.state,
      customer.state
    );

    const warnings: string[] = [];
    if (isOverCreditLimit(outstandingBefore, totals.total, Number(customer.creditLimit))) warnings.push(`This will put ${customer.name} at or over their credit limit.`);
    if (alreadyPaid > totals.total + 0.004) warnings.push(`${customer.shopName || customer.name} has paid ${fmtInr(alreadyPaid - totals.total)} more than the new total.`);

    // Only top up the remaining balance — inserting the full total again would
    // double-count whatever's already been recorded. The resulting status is
    // *derived*, not just taken from which Save button was clicked: real
    // money already on file promotes a plain save to at least PARTIALLY_PAID,
    // and a raised total turns a PAID invoice back into PARTIALLY_PAID.
    const topUp = data.markPaid ? Math.max(totals.total - alreadyPaid, 0) : 0;
    const newStatus = deriveStatus(totals.total, alreadyPaid + topUp, data.markSent || data.markPaid);

    const updated = await prisma.$transaction(async (tx) => {
      const oldLines = await withStockQty(tx, existing.items);
      const stockQtys = await lineStockQuantities(tx, data.items);
      const receiptNo = topUp > 0.004 ? await claimReceiptNumber(tx, company.id) : null;

      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      const inv = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          customerId: customer.id,
          date: new Date(data.date),
          due: new Date(data.due),
          status: newStatus,
          stockTaken: true,
          overallDiscountType: data.overallDiscountType,
          overallDiscountValue: data.overallDiscountValue,
          notes: data.notes?.trim() || null,
          deliveryInstructions: data.deliveryInstructions?.trim() || null,
          showTransportDetails: data.showTransportDetails,
          transportVehicleNo: data.transportVehicleNo?.trim() || null,
          transportDriverName: data.transportDriverName?.trim() || null,
          transportDriverPhone: data.transportDriverPhone?.trim() || null,
          ...gst,
          ...totalsColumns(totals),
          amountPaid: alreadyPaid + (topUp > 0.004 ? topUp : 0),
          items: { create: itemRows(data.items, stockQtys, company.defaultHsn) },
          ...(topUp > 0.004 ? { payments: { create: { amount: topUp, date: new Date(data.date), mode: data.paymentMode || 'Cash', receiptNo } } } : {}),
        },
      });

      await postStockChanges(tx, {
        direction: 'out',
        before: invoiceHeld(existing.stockTaken, oldLines),
        after: sumByProduct(data.items.map((l, i) => ({ productId: l.productId, stockQty: stockQtys[i] }))),
        increaseType: 'SALE',
        decreaseType: 'SALE_RETURN',
        meta: {
          invoiceId,
          invoiceNumber: existing.number,
          userId: user.id,
          note: data.allowNegativeStock ? 'Saved with stock below zero' : existing.stockTaken ? 'Invoice edited' : 'Draft saved',
        },
        enforce: !data.allowNegativeStock,
      });
      return inv;
    }, TX_OPTIONS);

    await logActivity({
      userId: user.id,
      action: 'invoice.update',
      entityType: 'invoice',
      entityId: invoiceId,
      summary: `Edited ${existing.number} — ${fmtInr(totals.total)}${existing.status !== newStatus ? ` · ${existing.status.toLowerCase().replace('_', ' ')} → ${newStatus.toLowerCase().replace('_', ' ')}` : ''}`,
    });
    schedulePdfBuild(invoiceId);
    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    revalidatePath(`/invoices/${invoiceId}`);
    return { invoiceId: updated.id, number: updated.number, status: updated.status, warning: warnings.join(' ') || undefined };
  } catch (e) {
    return toActionError(e);
  }
}

/** Only the columns the Invoices list renders — totals come from the stored
 * columns (see schema.prisma), so no items join is needed, just a count. */
const LIST_SELECT = {
  id: true,
  number: true,
  date: true,
  due: true,
  status: true,
  total: true,
  amountPaid: true,
  interState: true,
  lastRemindedAt: true,
  customer: { select: { name: true, shopName: true, state: true, phone: true } },
  payments: { select: { amount: true, date: true, mode: true }, orderBy: { date: 'asc' } },
  _count: { select: { items: true } },
} satisfies Prisma.InvoiceSelect;

function toListRow(inv: Prisma.InvoiceGetPayload<{ select: typeof LIST_SELECT }>, startOfToday: Date) {
  const total = Number(inv.total);
  const amountPaid = Number(inv.amountPaid);
  const { _count, total: _t, interState, ...rest } = inv;
  return {
    ...rest,
    payments: inv.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    computedTotal: total,
    amountPaid,
    balanceDue: total - amountPaid,
    isOverdue: isOverdue(inv.status, inv.due, startOfToday),
    // Inter-state (IGST) vs intra-state (CGST+SGST) — for the GST type
    // filter on the Invoices list.
    useIgst: interState,
    itemCount: _count.items,
  };
}

/** Overdue means the same thing everywhere (list, dashboard, bell,
 * reminders): an issued invoice — sent or part-paid — still owing money
 * after its due date in India. Drafts were never issued, so they're never
 * overdue; paid ones owe nothing. */
const OVERDUE_STATUSES: InvoiceStatus[] = ['SENT', 'PARTIALLY_PAID'];
function isOverdue(status: InvoiceStatus, due: Date, startOfToday: Date) {
  return OVERDUE_STATUSES.includes(status) && due < startOfToday;
}

type InvoiceWhereFilters = Omit<InvoiceListFilters, 'sort' | 'page' | 'pageSize'>;

const LIST_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID'] as const;

/** The statuses picked in the list's filter — `status` is one status or
 * several joined by commas ("PAID,DRAFT"), and may include OVERDUE (sent or
 * part-paid and past due). 'all', empty or unknown values pick nothing,
 * meaning no status filter. */
function pickedStatuses(status?: string): string[] {
  return (status ?? '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter((x) => (LIST_STATUSES as readonly string[]).includes(x) || x === 'OVERDUE');
}

function statusWhere(status?: string): Prisma.InvoiceWhereInput | null {
  const picked = pickedStatuses(status);
  if (!picked.length) return null;
  const plain = picked.filter((x) => x !== 'OVERDUE') as InvoiceStatus[];
  const any: Prisma.InvoiceWhereInput[] = [];
  if (plain.length) any.push({ status: { in: plain } });
  if (picked.includes('OVERDUE')) any.push({ status: { in: OVERDUE_STATUSES }, due: { lt: istDayRangeUtc(todayIst()).gte } });
  return any.length === 1 ? any[0] : { OR: any };
}

/** One WHERE for the Invoices list, its status counts and its totals, so
 * they can never disagree. Every filter — including amount range and GST
 * type — runs in Postgres against the stored totals columns. */
function invoiceWhere(f: InvoiceWhereFilters): Prisma.InvoiceWhereInput {
  const rest = invoiceWhereWithoutStatus(f);
  const st = statusWhere(f.status);
  return st ? { AND: [st, rest] } : rest;
}

function invoiceWhereWithoutStatus(f: InvoiceWhereFilters): Prisma.InvoiceWhereInput {
  return {
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
    prisma.invoice.groupBy({
      by: ['status'],
      where: { AND: [where, { status: { in: OVERDUE_STATUSES }, due: { lt: istDayRangeUtc(todayIst()).gte } }] },
      _count: { _all: true },
    }),
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

export type InvoiceBucket = { count: number; total: number; paid: number; balance: number };
export type InvoiceSummary = Record<(typeof LIST_STATUSES)[number], InvoiceBucket> & {
  /** The overdue part of SENT and PARTIALLY_PAID. */
  overdue: Record<'SENT' | 'PARTIALLY_PAID', InvoiceBucket>;
};

/** Count, total, paid and still-owed per status for the list's other
 * filters (search, dates, customer, amount, GST type) — the list's totals
 * strip adds up whichever statuses are picked, so "All" sums everything,
 * "Paid" only paid, "Paid + Draft" both. Amounts include GST (what the
 * customer pays). A draft owes nothing yet: its value is its total. */
export async function getInvoiceSummary(
  search?: string,
  dateFrom?: string,
  dateTo?: string,
  opts?: { customerId?: string; amountMin?: number; amountMax?: number; gstType?: 'all' | 'intra' | 'inter' }
): Promise<InvoiceSummary> {
  await requireUser();
  const where = invoiceWhereWithoutStatus({ search, dateFrom, dateTo, ...opts });
  const [all, late] = await Promise.all([
    prisma.invoice.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { total: true, amountPaid: true } }),
    prisma.invoice.groupBy({
      by: ['status'],
      where: { AND: [where, { status: { in: OVERDUE_STATUSES }, due: { lt: istDayRangeUtc(todayIst()).gte } }] },
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    }),
  ]);
  const bucket = (status: InvoiceStatus, row?: { _count: { _all: number }; _sum: { total: Prisma.Decimal | null; amountPaid: Prisma.Decimal | null } }): InvoiceBucket => {
    const total = Number(row?._sum.total ?? 0);
    const paid = status === 'DRAFT' ? 0 : status === 'PAID' ? total : Math.min(Number(row?._sum.amountPaid ?? 0), total);
    return { count: row?._count._all ?? 0, total, paid, balance: status === 'DRAFT' ? 0 : Math.max(0, total - paid) };
  };
  const by = new Map(all.map((r) => [r.status, r]));
  const lateBy = new Map(late.map((r) => [r.status, r]));
  return {
    DRAFT: bucket('DRAFT', by.get('DRAFT')),
    SENT: bucket('SENT', by.get('SENT')),
    PARTIALLY_PAID: bucket('PARTIALLY_PAID', by.get('PARTIALLY_PAID')),
    PAID: bucket('PAID', by.get('PAID')),
    overdue: { SENT: bucket('SENT', lateBy.get('SENT')), PARTIALLY_PAID: bucket('PARTIALLY_PAID', lateBy.get('PARTIALLY_PAID')) },
  };
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
  const startOfToday = istDayRangeUtc(todayIst()).gte;
  return { items: JSON.parse(JSON.stringify(rows.map((inv) => toListRow(inv, startOfToday)))), total };
}

const PaymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  date: z.string().min(1, 'Pick the payment date'),
  mode: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
});

/** Records a payment (with its own receipt number) and re-derives the
 * status. Stock only moves for a draft saved before drafts took stock (see
 * Invoice.stockTaken): one that receives money is a real sale, so it takes
 * its stock now. */
export async function recordPayment(invoiceId: string, input: z.input<typeof PaymentSchema>): Promise<{ error?: string; receiptNo?: string; paymentId?: string }> {
  const parsed = PaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the payment details' };
  const { amount, date, mode, reference } = parsed.data;
  try {
    const [user, company] = await Promise.all([requireUser(), getCompany()]);
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { number: true, total: true, amountPaid: true, status: true, stockTaken: true, items: { select: { productId: true, qty: true, unit: true, stockQty: true } } },
      });
      if (!invoice) throw new Error('Invoice not found');
      const lines = await withStockQty(tx, invoice.items);
      const totalPaid = Number(invoice.amountPaid) + amount;
      const newStatus = deriveStatus(Number(invoice.total), totalPaid, invoice.status !== 'DRAFT');
      const receiptNo = await claimReceiptNumber(tx, company.id);
      const payment = await tx.payment.create({
        data: { invoiceId, amount, date: new Date(date), mode: mode?.trim() || null, reference: reference?.trim() || null, receiptNo },
      });
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: newStatus, amountPaid: { increment: amount }, stockTaken: true } });
      await postStockChanges(tx, {
        direction: 'out',
        before: invoiceHeld(invoice.stockTaken, lines),
        after: sumByProduct(lines),
        increaseType: 'SALE',
        decreaseType: 'SALE_RETURN',
        meta: { invoiceId, invoiceNumber: invoice.number, userId: user.id, note: 'Payment received on a draft' },
      });
      return { number: invoice.number, receiptNo, paymentId: payment.id };
    }, TX_OPTIONS);
    await logActivity({ userId: user.id, action: 'payment.create', entityType: 'invoice', entityId: invoiceId, summary: `Recorded ${fmtInr(amount)}${mode ? ` by ${mode}` : ''} on ${result.number} (receipt ${result.receiptNo})` });
    schedulePdfBuild(invoiceId);
    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    return { receiptNo: result.receiptNo, paymentId: result.paymentId };
  } catch (e) {
    return toActionError(e);
  }
}

/** Removes a payment recorded by mistake. Credit-note payments are removed
 * by deleting the credit note instead, which also reverses its stock. */
export async function deletePayment(paymentId: string): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: { select: { id: true, number: true, total: true, status: true } } } });
    if (!payment) return { error: 'Payment not found' };
    if (payment.creditNoteId) return { error: 'This was paid from a credit note. Remove it on the credit note (or delete the credit note, for its own set-off).' };
    await prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id: paymentId } });
      const agg = await tx.payment.aggregate({ where: { invoiceId: payment.invoiceId }, _sum: { amount: true } });
      const paid = Number(agg._sum.amount ?? 0);
      // Never back to DRAFT: once it had money against it, it was sent.
      const status = deriveStatus(Number(payment.invoice.total), paid, payment.invoice.status !== 'DRAFT');
      await tx.invoice.update({ where: { id: payment.invoiceId }, data: { amountPaid: paid, status } });
    }, TX_OPTIONS);
    await logActivity({ userId: user.id, action: 'payment.delete', entityType: 'invoice', entityId: payment.invoiceId, summary: `Deleted payment ${fmtInr(Number(payment.amount))}${payment.receiptNo ? ` (receipt ${payment.receiptNo})` : ''} on ${payment.invoice.number}` });
    schedulePdfBuild(payment.invoiceId);
    revalidatePath('/invoices');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

export type HeldStockLine = { productId: string; name: string; qty: string; inStock: string };

/** What an invoice is holding out of stock, per tracked product. The
 * delete dialog lists it: for a draft, so the owner can choose to put it
 * back or not; for a sent or paid one (deleting never restocks those), as
 * what a credit note could return. Empty for a draft that holds nothing. */
export async function getHeldStock(invoiceId: string): Promise<{ error?: string; lines?: HeldStockLine[] }> {
  try {
    await requireUser();
    return await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { status: true, stockTaken: true, items: { select: { productId: true, qty: true, unit: true, stockQty: true } } },
      });
      if (!inv) return { error: 'Invoice not found' };
      const held = invoiceHeld(inv.stockTaken, await withStockQty(tx, inv.items));
      if (!held.size) return { lines: [] };
      const products = await tx.product.findMany({
        where: { id: { in: [...held.keys()] }, trackStock: true },
        select: { id: true, name: true, unit: true, packQty: true, stockQty: true, priceTiers: { select: { unit: true, approxQty: true } } },
        orderBy: { name: 'asc' },
      });
      return {
        lines: products
          .filter((p) => (held.get(p.id) ?? 0) > 1e-6)
          .map((p) => ({ productId: p.id, name: p.name, qty: formatStock(held.get(p.id)!, p), inStock: formatStock(Number(p.stockQty), p) })),
      };
    }, TX_OPTIONS);
  } catch (e) {
    return toActionError(e);
  }
}

/** Deletes an invoice with its items and payments (cascade). A draft puts
 * back the stock it took unless `restock` is false (the goods went out
 * anyway); a sent or paid invoice never does — its goods left with the
 * customer, and goods that come back are returned with a credit note. The
 * stock-history rows stay, keyed by the invoice number, so the ledger still
 * explains the movements. */
export async function deleteInvoice(id: string, opts?: { restock?: boolean }): Promise<{ error?: string }> {
  if (typeof id !== 'string' || !id) return { error: 'Invoice not found — refresh the page and try again.' };
  try {
    const user = await requireOwner();
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        number: true,
        status: true,
        pdfUrl: true,
        total: true,
        stockTaken: true,
        customer: { select: { name: true, shopName: true } },
        items: { select: { productId: true, qty: true, unit: true, stockQty: true } },
        creditNotes: { select: { number: true } },
      },
    });
    if (!invoice) return { error: 'Invoice not found' };
    // Its credit notes returned their own stock and money against it —
    // deleting the invoice underneath them would leave both dangling.
    if (invoice.creditNotes.length) {
      return { error: `${invoice.number} has credit note${invoice.creditNotes.length > 1 ? 's' : ''} ${invoice.creditNotes.map((c) => c.number).join(', ')}. Delete ${invoice.creditNotes.length > 1 ? 'them' : 'it'} first, then delete the invoice.` };
    }
    const restocked = invoice.status === 'DRAFT' && invoice.stockTaken && (opts?.restock ?? true);
    await prisma.$transaction(async (tx) => {
      if (restocked) {
        await postStockChanges(tx, {
          direction: 'out',
          before: invoiceHeld(invoice.stockTaken, await withStockQty(tx, invoice.items)),
          after: new Map(),
          increaseType: 'SALE',
          decreaseType: 'SALE_RETURN',
          meta: { invoiceId: id, invoiceNumber: invoice.number, userId: user.id, note: 'Draft deleted' },
        });
      }
      await tx.invoice.delete({ where: { id } }); // cascades to items + payments
    }, TX_OPTIONS);
    if (invoice.pdfUrl) await deleteUploadedImage(invoice.pdfUrl);
    await logActivity({
      userId: user.id,
      action: 'invoice.delete',
      entityType: 'invoice',
      entityId: id,
      summary: `Deleted ${invoice.number} (${invoice.customer.shopName || invoice.customer.name}, ${fmtInr(Number(invoice.total))})${
        invoice.status === 'DRAFT' && invoice.stockTaken ? (restocked ? ' — stock put back' : ' — stock not put back') : ''
      }`,
    });
    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

export async function duplicateInvoice(id: string): Promise<{ error?: string; invoiceId?: string }> {
  try {
    const [user, src, company] = await Promise.all([requireUser(), prisma.invoice.findUnique({ where: { id }, include: { items: true, customer: { select: { active: true, name: true } } } }), getCompany()]);
    if (!src) return { error: 'Invoice not found' };
    if (!src.customer.active) return { error: `${src.customer.name} is disabled. Enable them in Customers to bill them again.` };

    const created = await prisma.$transaction(async (tx) => {
      const number = await claimInvoiceNumber(tx, company.id);
      const today = new Date();
      // Re-derived from the products' current units, not copied — the
      // source's snapshot may predate a unit change.
      const stockQtys = await lineStockQuantities(tx, src.items.map((it) => ({ productId: it.productId, qty: Number(it.qty), unit: it.unit })));
      const dup = await tx.invoice.create({
        data: {
          customerId: src.customerId,
          number,
          date: today,
          due: today,
          // A draft — which, like any saved invoice, takes its stock.
          status: 'DRAFT',
          overallDiscountType: src.overallDiscountType,
          overallDiscountValue: src.overallDiscountValue,
          notes: src.notes,
          deliveryInstructions: src.deliveryInstructions,
          showTransportDetails: src.showTransportDetails,
          transportVehicleNo: src.transportVehicleNo,
          transportDriverName: src.transportDriverName,
          transportDriverPhone: src.transportDriverPhone,
          // A duplicate clones the source's GST config exactly — "duplicate
          // this exact invoice" semantics, not re-derived from Company.
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
          taxable: src.taxable,
          cgst: src.cgst,
          sgst: src.sgst,
          igst: src.igst,
          total: src.total,
          interState: src.interState,
          items: {
            create: src.items.map((it, i) => ({
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
              stockQty: stockQtys[i],
            })),
          },
        },
      });
      await postStockChanges(tx, {
        direction: 'out',
        before: new Map(),
        after: sumByProduct(src.items.map((it, i) => ({ productId: it.productId, stockQty: stockQtys[i] }))),
        increaseType: 'SALE',
        decreaseType: 'SALE_RETURN',
        meta: { invoiceId: dup.id, invoiceNumber: number, userId: user.id, date: today },
      });
      return dup;
    }, TX_OPTIONS);
    await logActivity({ userId: user.id, action: 'invoice.duplicate', entityType: 'invoice', entityId: created.id, summary: `Duplicated ${src.number} as ${created.number}` });
    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    return { invoiceId: created.id };
  } catch (e) {
    return toActionError(e);
  }
}

/** One-tap "Send" for a draft (the Dashboard's drafts card): marks it
 * sent, taking its stock if it was saved before drafts took stock. Same
 * stock rules as updateInvoice, without re-sending the whole invoice. */
export async function sendDraft(invoiceId: string): Promise<{ error?: string; number?: string }> {
  try {
    const user = await requireUser();
    const inv = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { number: true, status: true, total: true, amountPaid: true, stockTaken: true, items: { select: { productId: true, qty: true, unit: true, stockQty: true } } },
      });
      if (!invoice) throw new Error('Invoice not found');
      if (invoice.status !== 'DRAFT') throw new Error(`${invoice.number} isn't a draft any more.`);
      const lines = await withStockQty(tx, invoice.items);
      await postStockChanges(tx, {
        direction: 'out',
        before: invoiceHeld(invoice.stockTaken, lines),
        after: sumByProduct(lines),
        increaseType: 'SALE',
        decreaseType: 'SALE_RETURN',
        meta: { invoiceId, invoiceNumber: invoice.number, userId: user.id, note: 'Invoice sent' },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: deriveStatus(Number(invoice.total), Number(invoice.amountPaid), true), stockTaken: true },
      });
      return invoice;
    }, TX_OPTIONS);
    await logActivity({ userId: user.id, action: 'invoice.update', entityType: 'invoice', entityId: invoiceId, summary: `Sent ${inv.number}` });
    schedulePdfBuild(invoiceId);
    revalidatePath('/invoices');
    revalidatePath('/dashboard');
    return { number: inv.number };
  } catch (e) {
    return toActionError(e);
  }
}

export type LastOrder = {
  number: string;
  date: string;
  total: number;
  /** Average days between this customer's recent invoices, or null with
   * fewer than three to go on. */
  everyDays: number | null;
  items: { productId: string; name: string; unit: string; qty: number; discount: number }[];
};

/** A customer's most recent invoice (other than the one being edited), for
 * the builder's "Same as last time?" — catalog lines only, since an ad-hoc
 * line has no product to re-add. */
export async function getLastOrder(customerId: string, excludeInvoiceId?: string): Promise<LastOrder | null> {
  await requireUser();
  const recent = await prisma.invoice.findMany({
    where: { customerId, ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}) },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 5,
    select: { number: true, date: true, total: true, items: { where: { productId: { not: null } }, select: { productId: true, name: true, unit: true, qty: true, rate: true, discount: true } } },
  });
  const last = recent.find((r) => r.items.length);
  if (!last) return null;
  const gaps = recent.slice(0, -1).map((r, i) => (r.date.getTime() - recent[i + 1].date.getTime()) / 86_400_000);
  return {
    number: last.number,
    date: last.date.toISOString().slice(0, 10),
    total: Number(last.total),
    everyDays: gaps.length >= 2 ? Math.max(1, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)) : null,
    items: last.items
      // Free lines from an offer come back on their own when the offer applies.
      .filter((it) => Number(it.rate) > 0)
      .map((it) => ({ productId: it.productId!, name: it.name, unit: it.unit, qty: Number(it.qty), discount: Number(it.discount) })),
  };
}

export type OverdueReminder = { id: string; number: string; customer: string; phone: string | null; due: string; balance: number; lastRemindedAt: string | null };

/** Unpaid invoices past their due date, oldest first — the Invoices
 * screen's "Send reminders" list. */
export async function listOverdueForReminders(): Promise<OverdueReminder[]> {
  await requireUser();
  const rows = await prisma.invoice.findMany({
    where: { status: { in: ['SENT', 'PARTIALLY_PAID'] }, due: { lt: istDayRangeUtc(todayIst()).gte } },
    orderBy: [{ due: 'asc' }, { number: 'asc' }],
    take: 50,
    select: { id: true, number: true, due: true, total: true, amountPaid: true, lastRemindedAt: true, customer: { select: { name: true, shopName: true, phone: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    customer: r.customer.shopName || r.customer.name,
    phone: r.customer.phone,
    due: r.due.toISOString().slice(0, 10),
    balance: Math.max(0, Number(r.total) - Number(r.amountPaid)),
    lastRemindedAt: r.lastRemindedAt ? r.lastRemindedAt.toISOString() : null,
  }));
}

async function requestOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : '';
}

/** A link the customer can open without signing in (the invoice PDF), for
 * WhatsApp sharing and payment reminders. */
export async function getInvoiceShareLink(invoiceId: string): Promise<{ error?: string; url?: string }> {
  try {
    await requireUser();
    const exists = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } });
    if (!exists) return { error: 'Invoice not found' };
    schedulePdfBuild(invoiceId);
    return { url: `${await requestOrigin()}/api/share/${invoiceShareToken(invoiceId)}` };
  } catch (e) {
    return toActionError(e);
  }
}

/** Stamps "reminded just now" on an overdue invoice. Raw SQL on purpose:
 * Prisma's @updatedAt would otherwise bump updatedAt, which is part of the
 * stored PDF's cache key, and a reminder doesn't change the document. */
export async function markReminded(invoiceId: string): Promise<{ error?: string }> {
  try {
    const user = await requireUser();
    const n = await prisma.$executeRaw`UPDATE "Invoice" SET "lastRemindedAt" = NOW() WHERE id = ${invoiceId}`;
    if (!n) return { error: 'Invoice not found' };
    await logActivity({ userId: user.id, action: 'invoice.remind', entityType: 'invoice', entityId: invoiceId, summary: 'Sent a payment reminder on WhatsApp' });
    revalidatePath('/invoices');
    return {};
  } catch (e) {
    return toActionError(e);
  }
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

/** The standard Tally-style reference fields on the GST templates' header
 * grid (Delivery Note, Buyer's Order No, Dispatch Doc No, Bill of
 * Lading/LR-RR No, Other References, Destination) — pure print/reference
 * fields, no GST math or NIC payload depends on them, so this is a plain
 * update with no recompute/side effects. */
export async function updateDispatchDetails(invoiceId: string, input: z.infer<typeof DispatchDetailsSchema>): Promise<{ error?: string }> {
  const parsed = DispatchDetailsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid dispatch details' };

  try {
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
    schedulePdfBuild(invoiceId);
    revalidatePath(`/invoices/${invoiceId}`);
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
