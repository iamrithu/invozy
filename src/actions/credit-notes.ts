'use server';

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma, type Tx } from '@/lib/prisma';
import { COMPANY_ID } from '@/lib/company-id';
import { requireOwner, requireUser } from '@/lib/session';
import { deriveStatus, fmtInr, formatInvoiceNumber, formatUnit } from '@/lib/gst';
import { istDayRangeUtc } from '@/lib/dates';
import { toActionError } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { InsufficientStockError, lineStockQuantities, postStockChanges, sumByProduct } from '@/lib/stock';
import { schedulePdfBuild } from '@/lib/invoice-pdf';
import { customerDisplayName } from '@/lib/customer';
import {
  computeCreditNoteTotals,
  creditNoteRates,
  creditReasonText,
  creditedPerLine,
  invoiceBillFactor,
  round2,
  type CnRates,
  type CreditReasonId,
} from '@/components/credit-notes/credit-note-math';
import { fmtQty, istDateString } from '@/components/print/format';

// GST credit notes against an invoice — goods taken back, or a price
// corrected after the fact. A credit note's value is set off against its
// invoice as a Payment row (mode "Credit note", capped at what's still
// due); anything beyond that is a refund owed to the customer. Restocked
// lines post SALE_RETURN movements. See schema.prisma's CreditNote.

// Interactive transactions default to a 5s budget; a save also locks the
// invoice and posts one stock movement per restocked product, so give a
// slow Neon wake-up room — same budget as src/actions/invoices.ts.
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

/** Atomically takes the next credit-note number — the same claim-by-
 * increment pattern as claimInvoiceNumber in src/actions/invoices.ts: the
 * UPDATE's row lock serializes concurrent callers, and the incremented
 * value is read back from that same statement. Runs inside the
 * transaction that inserts the credit note, so a failed save releases it. */
async function claimCreditNoteNumber(tx: Pick<Tx, 'company'>) {
  const c = await tx.company.update({
    where: { id: COMPANY_ID },
    data: { nextCreditNoteNo: { increment: 1 } },
    select: { creditNotePrefix: true, invoiceFY: true, nextCreditNoteNo: true },
  });
  return formatInvoiceNumber(c.creditNotePrefix, c.invoiceFY, c.nextCreditNoteNo - 1);
}

/** Takes the invoice's row lock for the rest of the transaction, so two
 * credit notes (or a credit note and a payment) on the same invoice can't
 * both read the same "already credited" / "balance due" figures. */
async function lockInvoice(tx: Tx, invoiceId: string) {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
}

// ---------------------------------------------------------------------------
// Source invoice — what a new credit note can be raised against
// ---------------------------------------------------------------------------

const SOURCE_SELECT = {
  id: true,
  number: true,
  date: true,
  status: true,
  total: true,
  amountPaid: true,
  taxable: true,
  interState: true,
  cgstRate: true,
  sgstRate: true,
  igstRate: true,
  cgstEnabled: true,
  sgstEnabled: true,
  igstEnabled: true,
  customer: { select: { id: true, name: true, shopName: true, state: true } },
  items: { select: { id: true, productId: true, name: true, unit: true, hsn: true, qty: true, rate: true, discount: true }, orderBy: { id: 'asc' } },
  creditNotes: { select: { number: true, items: { select: { productId: true, name: true, unit: true, rate: true, qty: true } } }, orderBy: { date: 'asc' } },
} satisfies Prisma.InvoiceSelect;

type SourceRow = Prisma.InvoiceGetPayload<{ select: typeof SOURCE_SELECT }>;

export type CreditNoteSourceLine = {
  lineId: string;
  productId: string | null;
  name: string;
  unit: string;
  hsn: string | null;
  qty: number;
  rate: number;
  discount: number;
  /** Already credited on earlier credit notes for this invoice. */
  credited: number;
  /** What can still be credited: invoiced − credited. */
  remaining: number;
};

export type CreditNoteSource = {
  id: string;
  number: string;
  date: string;
  status: string;
  customer: { id: string; name: string; shopName: string | null; state: string };
  total: number;
  amountPaid: number;
  balanceDue: number;
  billFactor: number;
  rates: CnRates;
  lines: CreditNoteSourceLine[];
  earlierCreditNotes: string[];
};

function toSource(inv: SourceRow): CreditNoteSource {
  const lines = inv.items.map((it) => ({
    key: it.id,
    productId: it.productId,
    name: it.name,
    unit: it.unit,
    rate: Number(it.rate),
    qty: Number(it.qty),
  }));
  const credited = creditedPerLine(
    lines,
    inv.creditNotes.flatMap((cn) => cn.items.map((it) => ({ productId: it.productId, name: it.name, unit: it.unit, rate: Number(it.rate), qty: Number(it.qty) })))
  );
  const total = Number(inv.total);
  const amountPaid = Number(inv.amountPaid);
  return {
    id: inv.id,
    number: inv.number,
    date: istDateString(inv.date),
    status: inv.status,
    customer: inv.customer,
    total,
    amountPaid,
    balanceDue: round2(Math.max(0, total - amountPaid)),
    billFactor: invoiceBillFactor(
      Number(inv.taxable),
      inv.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) }))
    ),
    rates: creditNoteRates({
      interState: inv.interState,
      cgstRate: Number(inv.cgstRate),
      sgstRate: Number(inv.sgstRate),
      igstRate: Number(inv.igstRate),
      cgstEnabled: inv.cgstEnabled,
      sgstEnabled: inv.sgstEnabled,
      igstEnabled: inv.igstEnabled,
    }),
    lines: inv.items.map((it) => {
      const qty = Number(it.qty);
      const done = Math.min(qty, credited.get(it.id) ?? 0);
      return {
        lineId: it.id,
        productId: it.productId,
        name: it.name,
        unit: it.unit,
        hsn: it.hsn,
        qty,
        rate: Number(it.rate),
        discount: Number(it.discount),
        credited: Math.round(done * 1e6) / 1e6,
        remaining: Math.max(0, Math.round((qty - done) * 1e6) / 1e6),
      };
    }),
    earlierCreditNotes: inv.creditNotes.map((cn) => cn.number),
  };
}

/** The invoice a new credit note is raised against, with each line's
 * still-creditable quantity. Drafts are refused — they aren't sales yet,
 * so the draft itself should just be edited. */
export async function getCreditNoteSource(invoiceId: string): Promise<{ error?: string; source?: CreditNoteSource }> {
  try {
    await requireUser();
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: SOURCE_SELECT });
    if (!inv) return { error: 'Invoice not found. It may have been deleted.' };
    if (inv.status === 'DRAFT') return { error: `${inv.number} is still a draft. Edit the draft instead of raising a credit note.` };
    return { source: toSource(inv) };
  } catch (e) {
    return toActionError(e);
  }
}

/** Invoice picker for /credit-notes/new without `?invoice=` — sent, part-
 * paid and paid invoices matching the number or customer, newest first. */
export async function searchInvoicesForCreditNote(term: string) {
  await requireUser();
  const q = term.trim();
  const rows = await prisma.invoice.findMany({
    where: {
      status: { not: 'DRAFT' },
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: 'insensitive' } },
              { customer: { name: { contains: q, mode: 'insensitive' } } },
              { customer: { shopName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    select: { id: true, number: true, date: true, status: true, total: true, amountPaid: true, customer: { select: { name: true, shopName: true } }, _count: { select: { creditNotes: true } } },
    orderBy: [{ date: 'desc' }, { number: 'desc' }],
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: istDateString(r.date),
    status: r.status,
    total: Number(r.total),
    balanceDue: round2(Math.max(0, Number(r.total) - Number(r.amountPaid))),
    customerName: customerDisplayName(r.customer),
    creditNotes: r._count.creditNotes,
  }));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const CreditNoteInputSchema = z.object({
  invoiceId: z.string().min(1, 'Pick the invoice this credit note is for'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the credit note date'),
  reason: z.enum(['RETURN', 'DAMAGED', 'RATE', 'OTHER'] as const satisfies readonly CreditReasonId[]),
  note: z.string().max(300, 'Keep the note under 300 characters').optional().nullable(),
  restock: z.boolean(),
  lines: z.array(
    z.object({
      lineId: z.string(),
      qty: z.coerce.number().min(0, "Quantity can't be negative"),
      rate: z.coerce.number().min(0, "Rate can't be negative"),
      discount: z.coerce.number().min(0, 'Discount must be between 0 and 100%').max(100, 'Discount must be between 0 and 100%').default(0),
    })
  ),
});

export type CreditNoteInput = z.input<typeof CreditNoteInputSchema>;
export type CreditNoteResult = { error?: string; creditNoteId?: string; number?: string; total?: number; applied?: number; refundDue?: number };

/** Saves a credit note in one transaction: claim the number, store the
 * note and its lines (with their main-unit stock quantity), set its value
 * off against the invoice as a "Credit note" payment (never more than the
 * invoice still owes — the rest is a refund due), re-derive the invoice's
 * status, and put the goods back in stock when asked. Totals and every
 * line's limit are recomputed here from the invoice; the client's figures
 * are only ever a preview. */
export async function createCreditNote(input: CreditNoteInput): Promise<CreditNoteResult> {
  const parsed = CreditNoteInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the credit note and try again.' };
  const data = parsed.data;
  if (data.reason === 'OTHER' && !data.note?.trim()) return { error: 'Add a short note saying why this credit note is being given.' };

  try {
    const user = await requireUser();
    const result = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, data.invoiceId);
      const inv = await tx.invoice.findUnique({ where: { id: data.invoiceId }, select: SOURCE_SELECT });
      if (!inv) throw new Error('Invoice not found. It may have been deleted.');
      if (inv.status === 'DRAFT') throw new Error(`${inv.number} is still a draft. Edit the draft instead of raising a credit note.`);
      const source = toSource(inv);
      const byId = new Map(source.lines.map((l) => [l.lineId, l]));

      const chosen: { line: CreditNoteSourceLine; qty: number; rate: number; discount: number }[] = [];
      for (const req of data.lines) {
        if (!(req.qty > 0)) continue;
        const line = byId.get(req.lineId);
        if (!line) throw new Error(`${inv.number} was changed after you opened this page. Reload and try again.`);
        if (req.qty > line.remaining + 1e-6) {
          throw new Error(
            line.remaining > 0
              ? `${line.name}: only ${fmtQty(line.remaining)} ${formatUnit(line.unit)} is left to credit on this invoice.`
              : `${line.name} has already been fully credited on this invoice.`
          );
        }
        if (req.rate > line.rate + 0.005) throw new Error(`${line.name}: the credit rate can't be more than the invoiced ${fmtInr(line.rate)}.`);
        chosen.push({ line, qty: req.qty, rate: req.rate, discount: req.discount });
      }
      if (!chosen.length) throw new Error('Enter a quantity to credit on at least one line.');

      const totals = computeCreditNoteTotals(chosen, source.billFactor, source.rates);
      if (totals.total <= 0 && !data.restock) {
        throw new Error('This credit note adds up to ₹0. Enter a rate, or turn on "Put items back in stock" to record a return of free goods.');
      }

      const stockQtys = await lineStockQuantities(
        tx,
        chosen.map((c) => ({ productId: c.line.productId, qty: c.qty, unit: c.line.unit }))
      );
      const number = await claimCreditNoteNumber(tx);
      const applied = round2(Math.min(totals.total, source.balanceDue));
      const refundDue = round2(totals.total - applied);
      const date = new Date(data.date);

      const cn = await tx.creditNote.create({
        data: {
          number,
          date,
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          customerId: inv.customer.id,
          reason: creditReasonText(data.reason, data.note),
          restock: data.restock,
          cgstRate: source.rates.cgstRate,
          sgstRate: source.rates.sgstRate,
          igstRate: source.rates.igstRate,
          interState: source.rates.interState,
          taxable: totals.taxable,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          total: totals.total,
          refundDue,
          items: {
            create: chosen.map((c, i) => ({
              productId: c.line.productId,
              name: c.line.name,
              unit: c.line.unit,
              hsn: c.line.hsn,
              qty: c.qty,
              rate: c.rate,
              discount: c.discount,
              stockQty: stockQtys[i],
            })),
          },
        },
        select: { id: true },
      });

      if (applied > 0.004) {
        await tx.payment.create({
          data: { invoiceId: inv.id, amount: applied, date, mode: 'Credit note', reference: number, creditNoteId: cn.id },
        });
        const paid = source.amountPaid + applied;
        await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: { increment: applied }, status: deriveStatus(source.total, paid, true) } });
      }

      if (data.restock) {
        const after = sumByProduct(chosen.map((c, i) => ({ productId: c.line.productId, stockQty: stockQtys[i] })));
        await postStockChanges(tx, {
          direction: 'in',
          before: new Map(),
          after,
          increaseType: 'SALE_RETURN',
          decreaseType: 'SALE',
          meta: { creditNoteId: cn.id, invoiceId: inv.id, invoiceNumber: inv.number, reference: number, userId: user.id, note: `Credit note ${number}` },
        });
      }

      return { id: cn.id, number, total: totals.total, applied, refundDue, invoiceId: inv.id, invoiceNumber: inv.number, customer: customerDisplayName(inv.customer) };
    }, TX_OPTIONS);

    await logActivity({
      userId: user.id,
      action: 'credit-note.create',
      entityType: 'credit-note',
      entityId: result.id,
      summary: `Credit note ${result.number} for ${fmtInr(result.total)} against ${result.invoiceNumber} (${result.customer})${result.refundDue > 0.004 ? ` · refund due ${fmtInr(result.refundDue)}` : ''}`,
    });
    schedulePdfBuild(result.invoiceId);
    revalidatePath('/credit-notes');
    revalidatePath('/invoices');
    revalidatePath(`/invoices/${result.invoiceId}`);
    revalidatePath('/dashboard');
    return { creditNoteId: result.id, number: result.number, total: result.total, applied: result.applied, refundDue: result.refundDue };
  } catch (e) {
    return toActionError(e);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Owner-only. Takes back out of stock whatever the note put in (refused,
 * readably, if that stock has since been sold), deletes the note — its
 * "Credit note" payment cascades with it — and re-derives the invoice's
 * amount paid and status from the payments that remain. */
export async function deleteCreditNote(id: string): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();
    const cn = await prisma.creditNote.findUnique({
      where: { id },
      select: {
        number: true,
        restock: true,
        total: true,
        invoiceId: true,
        invoiceNumber: true,
        customer: { select: { name: true, shopName: true } },
        items: { select: { productId: true, qty: true, unit: true, stockQty: true } },
      },
    });
    if (!cn) return { error: 'Credit note not found. It may already have been deleted.' };

    await prisma.$transaction(async (tx) => {
      if (cn.invoiceId) await lockInvoice(tx, cn.invoiceId);
      if (cn.restock) {
        // Lines saved without a stock snapshot get one derived now, so the
        // reversal takes out exactly what went in.
        const missing = cn.items.some((it) => it.productId && it.stockQty == null);
        const derived = missing ? await lineStockQuantities(tx, cn.items.map((it) => ({ productId: it.productId, qty: Number(it.qty), unit: it.unit }))) : [];
        const lines = cn.items.map((it, i) => ({ productId: it.productId, stockQty: it.stockQty ?? derived[i] ?? null }));
        try {
          await postStockChanges(tx, {
            direction: 'in',
            before: sumByProduct(lines),
            after: new Map(),
            increaseType: 'SALE_RETURN',
            decreaseType: 'SALE',
            meta: { creditNoteId: id, invoiceId: cn.invoiceId, invoiceNumber: cn.invoiceNumber, reference: cn.number, userId: user.id, note: `Credit note ${cn.number} deleted` },
          });
        } catch (e) {
          if (e instanceof InsufficientStockError) {
            const list = e.shortages.map((s) => `${s.name} (in stock ${s.have}, this note returned ${s.need})`).join('; ');
            throw new Error(`Can't delete ${cn.number}: the stock it put back has already gone out — ${list}. Add or recount that stock first, then delete.`);
          }
          throw e;
        }
      }
      await tx.creditNote.delete({ where: { id } }); // cascades to items + its payment
      if (cn.invoiceId) {
        const [agg, inv] = await Promise.all([
          tx.payment.aggregate({ where: { invoiceId: cn.invoiceId }, _sum: { amount: true } }),
          tx.invoice.findUnique({ where: { id: cn.invoiceId }, select: { total: true } }),
        ]);
        if (inv) {
          const paid = Number(agg._sum.amount ?? 0);
          await tx.invoice.update({ where: { id: cn.invoiceId }, data: { amountPaid: paid, status: deriveStatus(Number(inv.total), paid, true) } });
        }
      }
    }, TX_OPTIONS);

    await logActivity({
      userId: user.id,
      action: 'credit-note.delete',
      entityType: 'credit-note',
      entityId: id,
      summary: `Deleted credit note ${cn.number} (${customerDisplayName(cn.customer)}, ${fmtInr(Number(cn.total))})${cn.invoiceNumber ? ` against ${cn.invoiceNumber}` : ''}`,
    });
    if (cn.invoiceId) schedulePdfBuild(cn.invoiceId);
    revalidatePath('/credit-notes');
    revalidatePath('/invoices');
    if (cn.invoiceId) revalidatePath(`/invoices/${cn.invoiceId}`);
    revalidatePath('/dashboard');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export type CreditNoteListFilters = {
  search?: string;
  /** IST calendar dates (`YYYY-MM-DD`), inclusive. */
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  page?: number;
  pageSize?: number;
};

export type CreditNoteListRow = {
  id: string;
  number: string;
  date: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  customer: { id: string; name: string; shopName: string | null };
  reason: string | null;
  restock: boolean;
  total: number;
  applied: number;
  refundDue: number;
};

/** DB-level search/date filter/pagination for the Credit notes list —
 * search matches the note number, invoice number or customer. */
export async function listCreditNotesPage(opts: CreditNoteListFilters = {}): Promise<{ items: CreditNoteListRow[]; total: number }> {
  await requireUser();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = opts.pageSize ?? 20;
  const q = opts.search?.trim();
  const where: Prisma.CreditNoteWhereInput = {
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { invoiceNumber: { contains: q, mode: 'insensitive' } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
            { customer: { shopName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(opts.dateFrom || opts.dateTo
      ? { date: { ...(opts.dateFrom ? { gte: istDayRangeUtc(opts.dateFrom).gte } : {}), ...(opts.dateTo ? { lt: istDayRangeUtc(opts.dateTo).lt } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.creditNote.findMany({
      where,
      select: {
        id: true,
        number: true,
        date: true,
        invoiceId: true,
        invoiceNumber: true,
        reason: true,
        restock: true,
        total: true,
        refundDue: true,
        customer: { select: { id: true, name: true, shopName: true } },
        payment: { select: { amount: true } },
      },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.creditNote.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      number: r.number,
      date: istDateString(r.date),
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      customer: r.customer,
      reason: r.reason,
      restock: r.restock,
      total: Number(r.total),
      applied: Number(r.payment?.amount ?? 0),
      refundDue: Number(r.refundDue),
    })),
    total,
  };
}
