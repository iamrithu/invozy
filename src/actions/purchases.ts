'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { decidesIgst, fmtInr } from '@/lib/gst';
import { istDayRangeUtc, todayIst } from '@/lib/dates';
import { InsufficientStockError, lineStockQuantities, postStockChanges, sumByProduct } from '@/lib/stock';
import { round6 } from '@/lib/stock-units';
import { deleteUploadedImage, isOwnUpload, saveUploadedDocument } from '@/lib/uploads';
import { computePurchaseTotals, PURCHASE_ATTACHMENT_LIMIT } from '@/components/purchases/purchase-math';
import { currentCompanyId } from '@/lib/tenant';
import { requireModule } from '@/lib/require-module';

// Supplier bills. Saving one adds its lines to stock (PURCHASE movements);
// editing posts only the difference against what the bill added before
// (PURCHASE_RETURN when a line shrinks), and deleting takes it all back out —
// see src/lib/stock.ts's postStockChanges. Lines for products that aren't
// tracked are kept on the bill but move no stock.
//
// A bill can also carry attachments (PDF/photo copies, for reference only).
// The form uploads each new file on its own (uploadPurchaseAttachment — one
// file per request stays under the host's body limit) right before saving,
// then savePurchase records the list; files dropped from a bill, or from a
// deleted bill, are deleted from storage after the save commits.

// Several sequential statements per bill (one stock movement per product)
// over Neon's WebSocket — give the transaction room, same as invoices.
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.');

const PurchaseLineSchema = z.object({
  productId: z.string().min(1).nullable(),
  name: z.string().trim().min(1, 'Each line needs a product.'),
  unit: z.string().trim().min(1, 'Each line needs a unit.'),
  qty: z.coerce.number().positive('Each line needs a quantity above zero.'),
  rate: z.coerce.number().min(0, 'A rate can’t be negative.'),
  gstRate: z.coerce.number().min(0, 'GST % can’t be negative.').max(100, 'GST % looks too high.'),
  batchNo: z.string().trim().max(60).optional().nullable(),
  expiryDate: dateString.optional().nullable().or(z.literal('')),
});

const AttachmentSchema = z.object({
  // Checked against the company's own upload folder in savePurchase.
  url: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  contentType: z.string().max(100),
  size: z.coerce.number().int().min(0),
});

const PurchaseInputSchema = z.object({
  supplierId: z.string().min(1, 'Pick a supplier.'),
  billNo: z.string().trim().max(60).optional().nullable(),
  date: dateString,
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(PurchaseLineSchema).min(1, 'Add at least one product to the bill.'),
  attachments: z.array(AttachmentSchema).max(PURCHASE_ATTACHMENT_LIMIT, `A bill can carry up to ${PURCHASE_ATTACHMENT_LIMIT} files.`).default([]),
});

export type PurchaseInput = z.input<typeof PurchaseInputSchema>;

export type PurchaseAttachmentInfo = z.infer<typeof AttachmentSchema>;

export type PurchaseListItem = {
  id: string;
  billNo: string | null;
  date: string;
  supplierId: string;
  supplierName: string;
  itemCount: number;
  attachmentCount: number;
  taxable: number;
  gst: number;
  total: number;
};

export type PurchaseDetail = {
  id: string;
  supplierId: string;
  billNo: string | null;
  date: string;
  notes: string | null;
  items: {
    productId: string | null;
    name: string;
    unit: string;
    qty: number;
    rate: number;
    gstRate: number;
    batchNo: string | null;
    expiryDate: string | null;
  }[];
  attachments: PurchaseAttachmentInfo[];
};

function clean(s?: string | null) {
  const t = s?.trim();
  return t ? t : null;
}

/** The readable version of a stock shortfall when a bill shrinks or goes
 * away — the stock it added has partly been sold since. */
function shortfallMessage(err: InsufficientStockError, verb: 'reduce' | 'delete') {
  const list = err.shortages.map((s) => `${s.name} (only ${s.have} left, this would take out ${s.need})`).join('; ');
  return `Can’t ${verb} this bill — some of its stock has already been sold: ${list}. Count the stock on the Inventory screen first if it’s really gone.`;
}

/** The Purchases list, newest bill first. */
export async function listPurchasesPage(opts?: {
  search?: string;
  supplierId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: PurchaseListItem[]; total: number }> {
  await requireModule('purchases');
  await requireUser();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const search = opts?.search?.trim();
  const where: Prisma.PurchaseWhereInput = {
    ...(opts?.supplierId && opts.supplierId !== 'all' ? { supplierId: opts.supplierId } : {}),
    ...(search
      ? { OR: [{ billNo: { contains: search, mode: 'insensitive' } }, { supplier: { name: { contains: search, mode: 'insensitive' } } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { supplier: { select: { name: true } }, _count: { select: { items: true, attachments: true } } },
    }),
    prisma.purchase.count({ where }),
  ]);
  return {
    items: rows.map((p) => ({
      id: p.id,
      billNo: p.billNo,
      date: p.date.toISOString().slice(0, 10),
      supplierId: p.supplierId,
      supplierName: p.supplier.name,
      itemCount: p._count.items,
      attachmentCount: p._count.attachments,
      taxable: Number(p.taxable),
      gst: Number(p.cgst) + Number(p.sgst) + Number(p.igst),
      total: Number(p.total),
    })),
    total,
  };
}

/** This month's purchases (IST calendar month) — the header strip on the
 * Purchases list: how much was bought and how much input GST it carries. */
export async function getPurchaseSummary(): Promise<{ monthLabel: string; total: number; inputGst: number; count: number }> {
  await requireModule('purchases');
  await requireUser();
  const today = todayIst();
  const start = istDayRangeUtc(`${today.slice(0, 7)}-01`).gte;
  const agg = await prisma.purchase.aggregate({
    where: { date: { gte: start } },
    _sum: { total: true, cgst: true, sgst: true, igst: true },
    _count: { _all: true },
  });
  return {
    monthLabel: new Date(`${today}T00:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
    total: Number(agg._sum.total ?? 0),
    inputGst: Number(agg._sum.cgst ?? 0) + Number(agg._sum.sgst ?? 0) + Number(agg._sum.igst ?? 0),
    count: agg._count._all,
  };
}

/** One bill, shaped for the purchase form. */
export async function getPurchase(id: string): Promise<PurchaseDetail | null> {
  await requireModule('purchases');
  await requireUser();
  const p = await prisma.purchase.findUnique({
    where: { id },
    include: { items: { orderBy: { id: 'asc' } }, attachments: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!p) return null;
  return {
    id: p.id,
    supplierId: p.supplierId,
    billNo: p.billNo,
    date: p.date.toISOString().slice(0, 10),
    notes: p.notes,
    items: p.items.map((it) => ({
      productId: it.productId,
      name: it.name,
      unit: it.unit,
      qty: Number(it.qty),
      rate: Number(it.rate),
      gstRate: Number(it.gstRate),
      batchNo: it.batchNo,
      expiryDate: it.expiryDate ? it.expiryDate.toISOString().slice(0, 10) : null,
    })),
    attachments: p.attachments.map((a) => ({ url: a.url, name: a.name, contentType: a.contentType, size: a.size })),
  };
}

/** Stores one file for a bill and returns it, ready to go on the bill when
 * it's saved. Nothing points at it until savePurchase records it — if that
 * never happens, the form hands it to discardPurchaseUploads. */
export async function uploadPurchaseAttachment(formData: FormData): Promise<ActionResult<{ attachment: PurchaseAttachmentInfo }>> {
  try {
    await requireModule('purchases');
    await requireUser();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { error: 'Pick a file to attach.' };
    const url = await saveUploadedDocument(file, 'purchases');
    return { attachment: { url, name: file.name.slice(0, 200) || 'Attachment', contentType: file.type, size: file.size } };
  } catch (err) {
    return toActionError(err);
  }
}

/** Deletes freshly uploaded files that never made it onto a bill (the save
 * after them failed). Files a saved bill points at are left alone — those
 * only go through savePurchase/deletePurchase. */
export async function discardPurchaseUploads(urls: string[]): Promise<ActionResult> {
  try {
    await requireModule('purchases');
    await requireUser();
    const companyId = await currentCompanyId();
    const own = urls.filter((u) => isOwnUpload(u, 'purchases', companyId));
    if (!own.length) return {};
    const onBills = await prisma.purchaseAttachment.findMany({ where: { url: { in: own } }, select: { url: true } });
    const keep = new Set(onBills.map((a) => a.url));
    await Promise.all(own.filter((u) => !keep.has(u)).map(deleteUploadedImage));
    return {};
  } catch (err) {
    return toActionError(err);
  }
}

/** The last rate (and GST %) each product was bought at, per unit — the
 * purchase form pre-fills a new line with it, since supplier prices rarely
 * change bill to bill. Keyed productId → lower-cased unit. */
export async function getLastPurchaseRates(): Promise<Record<string, Record<string, { rate: number; gstRate: number }>>> {
  await requireModule('purchases');
  await requireUser();
  const rows = await prisma.$queryRaw<{ productId: string; unit: string; rate: unknown; gstRate: unknown }[]>(Prisma.sql`
    SELECT DISTINCT ON (pi."productId", lower(pi."unit")) pi."productId", lower(pi."unit") AS "unit", pi."rate", pi."gstRate"
    FROM "PurchaseItem" pi JOIN "Purchase" p ON p."id" = pi."purchaseId"
    WHERE p."companyId" = ${await currentCompanyId()} AND pi."productId" IS NOT NULL
    ORDER BY pi."productId", lower(pi."unit"), p."date" DESC, p."createdAt" DESC`);
  const out: Record<string, Record<string, { rate: number; gstRate: number }>> = {};
  for (const r of rows) (out[r.productId] ??= {})[r.unit] = { rate: Number(r.rate), gstRate: Number(r.gstRate) };
  return out;
}

/** Creates (id = null) or replaces a supplier bill, and moves stock by what
 * changed — all in one transaction, so a bill is never saved without its
 * stock or vice versa. The purchase row is locked first so two people
 * editing the same bill at once can't both post the same difference. */
export async function savePurchase(id: string | null, input: PurchaseInput): Promise<ActionResult<{ purchaseId: string }>> {
  try {
    await requireModule('purchases');
    const user = await requireUser();
    const parsed = PurchaseInputSchema.safeParse(input);
    const companyId = await currentCompanyId();
    if (parsed.success && parsed.data.attachments.some((a) => !isOwnUpload(a.url, 'purchases', companyId))) {
      return { error: 'An attachment didn’t upload properly. Remove it and add it again.' };
    }
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the bill.' };
    const data = parsed.data;

    const productIds = [...new Set(data.items.map((l) => l.productId).filter((p): p is string => !!p))];
    const attachmentUrls = data.attachments.map((a) => a.url);
    const [company, supplier, current, products, onOtherBills] = await Promise.all([
      getCompany(),
      prisma.supplier.findUnique({ where: { id: data.supplierId } }),
      id ? prisma.purchase.findUnique({ where: { id }, select: { supplierId: true, attachments: { select: { url: true } } } }) : null,
      prisma.product.count({ where: { id: { in: productIds } } }),
      attachmentUrls.length ? prisma.purchaseAttachment.count({ where: { url: { in: attachmentUrls }, ...(id ? { purchaseId: { not: id } } : {}) } }) : 0,
    ]);
    if (id && !current) return { error: 'This purchase no longer exists.' };
    // A file belongs to one bill — deleting either bill deletes the file.
    if (onOtherBills) return { error: 'An attachment belongs to another bill. Remove it and add the file again.' };
    // Removing a saved file deletes it for good, like deleting the bill —
    // owner only.
    if (user.role !== 'OWNER' && current?.attachments.some((a) => !attachmentUrls.includes(a.url))) {
      return { error: 'Only the owner can remove a file from a saved bill.' };
    }
    if (!supplier) return { error: 'Pick a supplier for this bill.' };
    if (!supplier.active && supplier.id !== current?.supplierId) {
      return { error: `${supplier.name} is disabled. Enable it in Suppliers to record new bills from it.` };
    }
    if (products !== productIds.length) return { error: 'A product on this bill no longer exists. Remove that line and save again.' };

    const interState = decidesIgst(company.state, supplier.state || company.state, true);
    const totals = computePurchaseTotals(data.items, interState);
    const date = new Date(data.date);
    const billNo = clean(data.billNo);

    const purchaseId = await prisma.$transaction(async (tx) => {
      let before = new Map<string, number>();
      if (id) {
        await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${id} AND "companyId" = ${await currentCompanyId()} FOR UPDATE`;
        const oldItems = await tx.purchaseItem.findMany({ where: { purchaseId: id }, select: { productId: true, stockQty: true } });
        before = sumByProduct(oldItems);
        await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
        await tx.purchaseAttachment.deleteMany({ where: { purchaseId: id } });
      }
      const stockQtys = await lineStockQuantities(
        tx,
        data.items.map((l) => ({ productId: l.productId, qty: l.qty, unit: l.unit }))
      );
      const itemRows = data.items.map((l, i) => ({
        productId: l.productId,
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        rate: l.rate,
        gstRate: l.gstRate,
        stockQty: stockQtys[i],
        batchNo: clean(l.batchNo),
        expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
      }));
      const fields = {
        supplierId: supplier.id,
        billNo,
        date,
        notes: clean(data.notes),
        ...totals,
        items: { create: itemRows },
        attachments: { create: data.attachments.map((a, i) => ({ ...a, sortOrder: i })) },
      };
      const saved = id
        ? await tx.purchase.update({ where: { id }, data: fields, select: { id: true } })
        : await tx.purchase.create({ data: fields, select: { id: true } });

      // Cost per MAIN unit (ex-GST) for the average-cost figure, and the
      // product's batch/expiry for its ledger row. Which batches are on hand
      // is read from the bill's own lines, so one ledger row per product is
      // enough even when a bill carries two batches of it.
      const perProductMeta = new Map<string, { unitCost?: number | null; batchNo?: string | null; expiryDate?: Date | null }>();
      for (const pid of new Set(itemRows.map((r) => r.productId).filter((p): p is string => !!p))) {
        const lines = itemRows.filter((r) => r.productId === pid);
        const mainQty = lines.reduce((s, r) => s + (r.stockQty ?? 0), 0);
        const value = lines.reduce((s, r) => s + r.qty * r.rate, 0);
        const withBatch = lines.find((r) => r.batchNo || r.expiryDate);
        perProductMeta.set(pid, {
          unitCost: mainQty > 0 && value > 0 ? round6(value / mainQty) : null,
          batchNo: withBatch?.batchNo ?? null,
          expiryDate: withBatch?.expiryDate ?? null,
        });
      }
      await postStockChanges(tx, {
        direction: 'in',
        before,
        after: sumByProduct(itemRows),
        increaseType: 'PURCHASE',
        decreaseType: 'PURCHASE_RETURN',
        meta: { purchaseId: saved.id, reference: billNo, date, userId: user.id, note: id ? 'Bill edited' : null },
        perProductMeta,
      });
      return saved.id;
    }, TX_OPTIONS);

    const kept = new Set(attachmentUrls);
    await Promise.all((current?.attachments ?? []).filter((a) => !kept.has(a.url)).map((a) => deleteUploadedImage(a.url)));

    await logActivity({
      userId: user.id,
      action: id ? 'purchase.updated' : 'purchase.created',
      entityType: 'purchase',
      entityId: purchaseId,
      summary: `${id ? 'Edited' : 'Recorded'} purchase${billNo ? ` bill ${billNo}` : ''} from ${supplier.name} — ${fmtInr(totals.total, company.currency)}`,
    });
    revalidatePath('/dashboard');
    return { purchaseId };
  } catch (err) {
    if (err instanceof InsufficientStockError) return { error: shortfallMessage(err, 'reduce') };
    return toActionError(err);
  }
}

/** Owner only. Takes everything the bill added back out of stock first —
 * refused, with the reason, if that stock has since been sold. The ledger
 * keeps both rows (they lose their link to the deleted bill but keep its
 * bill number as the reference). Its attached files are deleted too. */
export async function deletePurchase(id: string): Promise<ActionResult> {
  try {
    await requireModule('purchases');
    const user = await requireOwner();
    const deleted = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${id} AND "companyId" = ${await currentCompanyId()} FOR UPDATE`;
      const p = await tx.purchase.findUnique({
        where: { id },
        include: { supplier: { select: { name: true } }, items: { select: { productId: true, stockQty: true } }, attachments: { select: { url: true } } },
      });
      if (!p) throw new Error('This purchase was already deleted.');
      await postStockChanges(tx, {
        direction: 'in',
        before: sumByProduct(p.items),
        after: new Map(),
        increaseType: 'PURCHASE',
        decreaseType: 'PURCHASE_RETURN',
        meta: { purchaseId: id, reference: p.billNo, date: p.date, userId: user.id, note: 'Bill deleted' },
      });
      await tx.purchase.delete({ where: { id } });
      return p;
    }, TX_OPTIONS);
    await Promise.all(deleted.attachments.map((a) => deleteUploadedImage(a.url)));
    await logActivity({
      userId: user.id,
      action: 'purchase.deleted',
      entityType: 'purchase',
      entityId: id,
      summary: `Deleted purchase${deleted.billNo ? ` bill ${deleted.billNo}` : ''} from ${deleted.supplier.name} — ${fmtInr(Number(deleted.total))}`,
    });
    revalidatePath('/dashboard');
    return {};
  } catch (err) {
    if (err instanceof InsufficientStockError) return { error: shortfallMessage(err, 'delete') };
    return toActionError(err);
  }
}
