'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { requireModule } from '@/lib/require-module';

// Suppliers are who the business buys stock from — the "Bill from" on a
// purchase. Their state decides whether a purchase's input GST is IGST or
// CGST+SGST, exactly as a customer's state does for an invoice.

const SupplierSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  contact: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email('Enter a valid email.').optional().nullable().or(z.literal('')),
  gstin: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .refine((s) => s === '' || /^[0-9A-Z]{15}$/.test(s), 'A GSTIN is 15 letters and digits.')
    .optional()
    .nullable(),
  state: z.string().trim().max(60).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
});

export type SupplierInput = z.input<typeof SupplierSchema>;

export type SupplierRow = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  state: string | null;
  address: string | null;
  active: boolean;
  purchaseCount: number;
  purchaseTotal: number;
  lastPurchaseAt: string | null;
};

export type SupplierOption = { id: string; name: string; state: string | null; gstin: string | null; active: boolean };

function blankToNull<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])) as T;
}

/** The Suppliers list — every supplier with how much has been bought from
 * them. Not paginated: a distributor buys from a handful of companies. */
export async function listSuppliers(opts?: { search?: string; includeInactive?: boolean }): Promise<SupplierRow[]> {
  await requireModule('purchases');
  await requireUser();
  const search = opts?.search?.trim();
  const [suppliers, totals] = await Promise.all([
    prisma.supplier.findMany({
      where: {
        ...(opts?.includeInactive ? {} : { active: true }),
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }, { gstin: { contains: search, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    prisma.purchase.groupBy({ by: ['supplierId'], _sum: { total: true }, _count: { _all: true }, _max: { date: true } }),
  ]);
  const bySupplier = new Map(totals.map((t) => [t.supplierId, t]));
  return suppliers.map((s) => {
    const t = bySupplier.get(s.id);
    return {
      id: s.id,
      name: s.name,
      contact: s.contact,
      phone: s.phone,
      email: s.email,
      gstin: s.gstin,
      state: s.state,
      address: s.address,
      active: s.active,
      purchaseCount: t?._count._all ?? 0,
      purchaseTotal: Number(t?._sum.total ?? 0),
      lastPurchaseAt: t?._max.date ? t._max.date.toISOString() : null,
    };
  });
}

/** Lightweight list for the purchase form's supplier picker and the
 * purchases filter — active suppliers, plus `includeId` even if it has been
 * disabled since (so an old purchase still shows who it was from). */
export async function listSupplierOptions(includeId?: string | null): Promise<SupplierOption[]> {
  await requireModule('purchases');
  await requireUser();
  return prisma.supplier.findMany({
    where: includeId ? { OR: [{ active: true }, { id: includeId }] } : { active: true },
    select: { id: true, name: true, state: true, gstin: true, active: true },
    orderBy: { name: 'asc' },
  });
}

export async function createSupplier(input: SupplierInput): Promise<ActionResult<{ supplier: SupplierOption }>> {
  try {
    await requireModule('purchases');
    const user = await requireUser();
    const parsed = SupplierSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
    const data = blankToNull(parsed.data);
    const supplier = await prisma.supplier.create({
      data: { ...data, name: parsed.data.name },
      select: { id: true, name: true, state: true, gstin: true, active: true },
    });
    await logActivity({ userId: user.id, action: 'supplier.created', entityType: 'supplier', entityId: supplier.id, summary: `Added supplier ${supplier.name}` });
    return { supplier };
  } catch (err) {
    return toActionError(err);
  }
}

/** A supplier's state change doesn't rewrite past purchases — each purchase
 * keeps the CGST/SGST or IGST split it was saved with, the same way an
 * issued invoice keeps its own. Re-saving a purchase picks up the new state. */
export async function updateSupplier(id: string, input: SupplierInput): Promise<ActionResult> {
  try {
    await requireModule('purchases');
    const user = await requireUser();
    const parsed = SupplierSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
    const data = blankToNull(parsed.data);
    const { count } = await prisma.supplier.updateMany({ where: { id }, data: { ...data, name: parsed.data.name } });
    if (!count) return { error: 'This supplier no longer exists.' };
    await logActivity({ userId: user.id, action: 'supplier.updated', entityType: 'supplier', entityId: id, summary: `Edited supplier ${parsed.data.name}` });
    return {};
  } catch (err) {
    return toActionError(err);
  }
}

/** Disabled suppliers keep their purchases but drop out of the purchase
 * form's picker — the safe alternative to deleting one with history. */
export async function setSupplierActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    await requireModule('purchases');
    const user = await requireUser();
    const supplier = await prisma.supplier.update({ where: { id }, data: { active }, select: { name: true } }).catch(() => null);
    if (!supplier) return { error: 'This supplier no longer exists.' };
    await logActivity({
      userId: user.id,
      action: active ? 'supplier.enabled' : 'supplier.disabled',
      entityType: 'supplier',
      entityId: id,
      summary: `${active ? 'Enabled' : 'Disabled'} supplier ${supplier.name}`,
    });
    return {};
  } catch (err) {
    return toActionError(err);
  }
}

/** Owner only, and only while no purchase points at the supplier — with
 * history on file the answer is `canDisable`, so the screen can offer
 * Disable in the same breath. */
export async function deleteSupplier(id: string): Promise<ActionResult<{ canDisable: boolean }>> {
  try {
    await requireModule('purchases');
    const user = await requireOwner();
    const supplier = await prisma.supplier.findUnique({ where: { id }, select: { name: true, _count: { select: { purchases: true } } } });
    if (!supplier) return { error: 'This supplier no longer exists.' };
    if (supplier._count.purchases > 0) {
      return {
        error: `${supplier.name} has ${supplier._count.purchases} purchase${supplier._count.purchases === 1 ? '' : 's'} on file, so it can’t be deleted. Disable it instead to hide it from new purchases.`,
        canDisable: true,
      };
    }
    await prisma.supplier.delete({ where: { id } });
    await logActivity({ userId: user.id, action: 'supplier.deleted', entityType: 'supplier', entityId: id, summary: `Deleted supplier ${supplier.name}` });
    return {};
  } catch (err) {
    return toActionError(err);
  }
}
