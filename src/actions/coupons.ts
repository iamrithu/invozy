'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { DiscountKind, DiscountScope, OrderSource } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { requireModule } from '@/lib/require-module';
import { logActivity } from '@/lib/activity';
import { assertCanCreate } from '@/lib/subscription-guard';
import { liveState } from '@/lib/discounts';

// Marketing › Coupons (with a code) and Marketing › Discounts (automatic,
// code = null). Both live in the Coupon table and are priced by
// src/lib/pricing.ts.

export type CouponState = 'active' | 'off' | 'scheduled' | 'expired';

export type CouponRow = {
  id: string;
  code: string | null;
  title: string;
  kind: DiscountKind;
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
  scope: DiscountScope;
  categoryIds: string[];
  categoryNames: string[];
  firstOrderOnly: boolean;
  customerGroupIds: string[];
  channels: OrderSource[];
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  combinable: boolean;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  state: CouponState;
  discountGiven: number;
};

/** Codes (`automatic: false`) or automatic discounts, newest first, with
 * what each has given away. */
export async function listCoupons(opts: { automatic: boolean }): Promise<CouponRow[]> {
  await requireUser();
  await requireModule('marketing');
  const rows = await prisma.coupon.findMany({
    where: { deletedAt: null, code: opts.automatic ? null : { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  const [given, cats] = await Promise.all([
    prisma.order.groupBy({
      by: ['couponId'],
      where: { couponId: { in: rows.map((r) => r.id) }, status: { not: 'CANCELLED' } },
      _sum: { couponDiscount: true },
    }),
    prisma.category.findMany({ where: { id: { in: Array.from(new Set(rows.flatMap((r) => r.categoryIds))) } }, select: { id: true, name: true } }),
  ]);
  // Automatic discounts are recorded per order by label, not by id.
  const autoGiven = opts.automatic
    ? await prisma.order.groupBy({ by: ['autoDiscountLabel'], where: { autoDiscountLabel: { in: rows.map((r) => r.title) }, status: { not: 'CANCELLED' } }, _sum: { autoDiscount: true } })
    : [];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  return rows.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    kind: c.kind,
    value: Number(c.value),
    maxDiscount: c.maxDiscount == null ? null : Number(c.maxDiscount),
    minOrderValue: Number(c.minOrderValue),
    scope: c.scope,
    categoryIds: c.categoryIds,
    categoryNames: c.categoryIds.map((id) => catName.get(id)).filter((x): x is string => !!x),
    firstOrderOnly: c.firstOrderOnly,
    customerGroupIds: c.customerGroupIds,
    channels: c.channels,
    usageLimit: c.usageLimit,
    perCustomerLimit: c.perCustomerLimit,
    usedCount: c.usedCount,
    combinable: c.combinable,
    startsAt: c.startsAt ? c.startsAt.toISOString() : null,
    endsAt: c.endsAt ? c.endsAt.toISOString() : null,
    active: c.active,
    state: liveState(c),
    discountGiven: opts.automatic
      ? Number(autoGiven.find((g) => g.autoDiscountLabel === c.title)?._sum.autoDiscount ?? 0)
      : Number(given.find((g) => g.couponId === c.id)?._sum.couponDiscount ?? 0),
  }));
}

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable()
  .or(z.literal(''));

const CouponSchema = z
  .object({
    automatic: z.boolean().default(false),
    code: z.string().trim().toUpperCase().optional().nullable(),
    title: z.string().trim().min(1, 'Give it a title.').max(80, 'Keep the title under 80 characters.'),
    kind: z.enum(['PERCENT', 'FLAT', 'FREE_DELIVERY']),
    value: z.coerce.number().min(0).default(0),
    maxDiscount: z.coerce.number().min(0).optional().nullable(),
    minOrderValue: z.coerce.number().min(0, 'The minimum order can’t be negative.').default(0),
    scope: z.enum(['ALL', 'CATEGORIES']).default('ALL'),
    categoryIds: z.array(z.string()).max(100).default([]),
    firstOrderOnly: z.boolean().default(false),
    customerGroupIds: z.array(z.string()).max(50).default([]),
    channels: z.array(z.enum(['MANUAL', 'WEB'])).min(1, 'Pick at least one place it works: the web store or manual orders.'),
    usageLimit: z.coerce.number().int().min(1, 'Total uses must be 1 or more.').optional().nullable(),
    perCustomerLimit: z.coerce.number().int().min(1, 'Uses per customer must be 1 or more.').optional().nullable(),
    combinable: z.boolean().default(false),
    startsAt: dateOnly,
    endsAt: dateOnly,
    active: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (!d.automatic && !/^[A-Z0-9-]{3,20}$/.test(d.code ?? '')) ctx.addIssue({ code: 'custom', path: ['code'], message: 'Use 3–20 letters, numbers or dashes.' });
    if (d.kind === 'PERCENT' && (d.value <= 0 || d.value > 100)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage must be more than 0 and at most 100.' });
    if (d.kind === 'FLAT' && d.value <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter how much it takes off.' });
    if (d.automatic && d.kind === 'FREE_DELIVERY') ctx.addIssue({ code: 'custom', path: ['kind'], message: 'Free delivery works as a coupon code, not an automatic discount.' });
    if (d.automatic && d.minOrderValue <= 0) ctx.addIssue({ code: 'custom', path: ['minOrderValue'], message: 'An automatic discount needs a minimum order value, or it would apply to every order.' });
    if (d.scope === 'CATEGORIES' && d.categoryIds.length === 0) ctx.addIssue({ code: 'custom', path: ['categoryIds'], message: 'Pick at least one category.' });
    if (d.startsAt && d.endsAt && d.endsAt < d.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end date is before the start date.' });
  });

export type CouponInput = z.input<typeof CouponSchema>;
export type CouponSaveResult = { error?: string; fieldErrors?: Record<string, string>; id?: string };

function fieldErrorsOf(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function dataOf(d: z.output<typeof CouponSchema>) {
  return {
    code: d.automatic ? null : d.code!,
    title: d.title,
    kind: d.kind,
    value: d.kind === 'FREE_DELIVERY' ? 0 : d.value,
    maxDiscount: d.kind === 'PERCENT' && d.maxDiscount ? d.maxDiscount : null,
    minOrderValue: d.minOrderValue,
    scope: d.scope,
    categoryIds: d.scope === 'CATEGORIES' ? d.categoryIds : [],
    firstOrderOnly: d.automatic ? false : d.firstOrderOnly,
    customerGroupIds: d.customerGroupIds,
    channels: d.channels,
    usageLimit: d.automatic ? null : d.usageLimit ?? null,
    perCustomerLimit: d.automatic ? null : d.perCustomerLimit ?? null,
    combinable: d.automatic ? false : d.combinable,
    // Whole IST days: from the start of the first to the end of the last.
    startsAt: d.startsAt ? new Date(`${d.startsAt}T00:00:00+05:30`) : null,
    endsAt: d.endsAt ? new Date(`${d.endsAt}T23:59:59.999+05:30`) : null,
    active: d.active,
  };
}

export async function createCoupon(input: CouponInput): Promise<CouponSaveResult> {
  try {
    const user = await requireOwner();
    await requireModule('marketing');
    await assertCanCreate('coupon');
    const parsed = CouponSchema.safeParse(input);
    if (!parsed.success) return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsOf(parsed.error) };
    const data = dataOf(parsed.data);
    if (data.code && (await prisma.coupon.findFirst({ where: { code: data.code }, select: { id: true } }))) {
      return { error: `${data.code} is already used.`, fieldErrors: { code: `${data.code} is already used. Codes stay unique, even after a coupon is deleted.` } };
    }
    if (!data.code && (await prisma.coupon.findFirst({ where: { code: null, title: data.title, deletedAt: null }, select: { id: true } }))) {
      return { error: 'Pick a different name.', fieldErrors: { title: 'Another automatic discount already has this name.' } };
    }
    const c = await prisma.coupon.create({ data });
    await logActivity({ userId: user.id, action: 'coupon.create', entityType: 'coupon', entityId: c.id, summary: data.code ? `Created coupon ${data.code}` : `Created automatic discount ${data.title}` });
    revalidatePath('/coupons');
    revalidatePath('/discounts');
    return { id: c.id };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateCoupon(id: string, input: CouponInput): Promise<CouponSaveResult> {
  try {
    const user = await requireOwner();
    await requireModule('marketing');
    const existing = await prisma.coupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
    if (!existing || existing.deletedAt) return { error: 'That coupon no longer exists.' };
    const parsed = CouponSchema.safeParse({ ...input, automatic: existing.code === null });
    if (!parsed.success) return { error: 'Check the highlighted fields.', fieldErrors: fieldErrorsOf(parsed.error) };
    const data = dataOf(parsed.data);
    if (data.code !== existing.code) {
      if (existing._count.redemptions > 0) return { error: 'This code has been used, so it can’t be renamed.', fieldErrors: { code: 'Used codes can’t be renamed; past orders show them.' } };
      if (data.code && (await prisma.coupon.findFirst({ where: { code: data.code, id: { not: id } }, select: { id: true } }))) {
        return { error: `${data.code} is already used.`, fieldErrors: { code: `${data.code} is already used.` } };
      }
    }
    await prisma.coupon.update({ where: { id }, data });
    await logActivity({ userId: user.id, action: 'coupon.update', entityType: 'coupon', entityId: id, summary: `Updated ${data.code ?? data.title}` });
    revalidatePath('/coupons');
    revalidatePath('/discounts');
    return { id };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setCouponActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    await requireModule('marketing');
    const c = await prisma.coupon.update({ where: { id }, data: { active }, select: { code: true, title: true } });
    await logActivity({ userId: user.id, action: 'coupon.active', entityType: 'coupon', entityId: id, summary: `${active ? 'Switched on' : 'Switched off'} ${c.code ?? c.title}` });
    revalidatePath('/coupons');
    revalidatePath('/discounts');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

/** A coupon nobody used is removed; a used one is kept (orders show its
 * code) but stops working and leaves the list. */
export async function deleteCoupon(id: string): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    await requireModule('marketing');
    const c = await prisma.coupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true, orders: true } } } });
    if (!c) return {};
    if (c._count.redemptions || c._count.orders) await prisma.coupon.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    else await prisma.coupon.delete({ where: { id } });
    await logActivity({ userId: user.id, action: 'coupon.delete', entityType: 'coupon', entityId: id, summary: `Deleted ${c.code ?? c.title}` });
    revalidatePath('/coupons');
    revalidatePath('/discounts');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

// ── Buy X get Y (the existing Scheme model, shown under Discounts) ──────────

export type SchemeListRow = { id: string; productId: string; productName: string; unit: string; buyQty: number; freeQty: number; name: string | null; active: boolean; validFrom: string | null; validTo: string | null };

export async function listAllSchemes(): Promise<SchemeListRow[]> {
  await requireUser();
  await requireModule('marketing');
  const rows = await prisma.scheme.findMany({ orderBy: { createdAt: 'desc' }, include: { product: { select: { name: true } } } });
  return rows.map((s) => ({
    id: s.id,
    productId: s.productId,
    productName: s.product.name,
    unit: s.unit,
    buyQty: Number(s.buyQty),
    freeQty: Number(s.freeQty),
    name: s.name,
    active: s.active,
    validFrom: s.validFrom ? s.validFrom.toISOString() : null,
    validTo: s.validTo ? s.validTo.toISOString() : null,
  }));
}

export async function setSchemeActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await requireModule('marketing');
    const s = await prisma.scheme.update({ where: { id }, data: { active }, select: { productId: true } });
    await logActivity({ userId: user.id, action: 'product.offer.update', entityType: 'product', entityId: s.productId, summary: `${active ? 'Switched on' : 'Switched off'} a Buy X get Y scheme` });
    revalidatePath('/discounts');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
