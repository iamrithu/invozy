import type { Coupon, OrderSource } from '@prisma/client';
import { prisma, type Tx } from '@/lib/prisma';
import { currentCompanyId } from '@/lib/tenant';
import type { DiscountRule } from '@/lib/pricing';

// Server-side checks for coupons and automatic discounts — the parts of
// pricing that need the database (status, dates, channel, usage limits,
// first orders). src/lib/pricing.ts does the arithmetic. Not a 'use server'
// module: these take a transaction and are called by src/actions/orders.ts.

export function toRule(c: Coupon): DiscountRule {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    kind: c.kind,
    value: Number(c.value),
    maxDiscount: c.maxDiscount == null ? null : Number(c.maxDiscount),
    minOrderValue: Number(c.minOrderValue),
    scope: c.scope,
    categoryIds: c.categoryIds,
    combinable: c.combinable,
  };
}

/** Whether a coupon row can be used right now, by schedule and switch. */
export function liveState(c: Pick<Coupon, 'active' | 'deletedAt' | 'startsAt' | 'endsAt'>, now = new Date()): 'active' | 'off' | 'scheduled' | 'expired' {
  if (c.deletedAt || !c.active) return 'off';
  if (c.startsAt && c.startsAt > now) return 'scheduled';
  if (c.endsAt && c.endsAt < now) return 'expired';
  return 'active';
}

const fmtDay = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Automatic discounts live on this channel now (usage limits respected). */
export async function liveAutomaticDiscounts(db: Tx, channel: OrderSource, customerGroupId: string | null): Promise<DiscountRule[]> {
  const now = new Date();
  const rows = await db.coupon.findMany({
    where: { code: null, active: true, deletedAt: null, channels: { has: channel }, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
  });
  return rows
    .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
    .filter((c) => !c.customerGroupIds.length || (customerGroupId != null && c.customerGroupIds.includes(customerGroupId)))
    .map(toRule);
}

/** The coupon a typed code names, if this customer may use it on this
 * channel now — otherwise why not, as a sentence. `orderId` is the order
 * being edited, whose own use doesn't count against the limits. */
export async function findCouponForOrder(
  db: Tx,
  rawCode: string,
  ctx: { channel: OrderSource; customerId: string; customerGroupId: string | null; orderId?: string | null }
): Promise<{ coupon: Coupon; rule: DiscountRule } | { error: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { error: 'Enter a coupon code.' };
  const c = await db.coupon.findFirst({ where: { code, deletedAt: null } });
  if (!c) return { error: `There’s no coupon called ${code}.` };
  const state = liveState(c);
  if (state === 'off') return { error: `${code} is switched off.` };
  if (state === 'scheduled') return { error: `${code} starts on ${fmtDay(c.startsAt!)}.` };
  if (state === 'expired') return { error: `${code} ended on ${fmtDay(c.endsAt!)}.` };
  if (!c.channels.includes(ctx.channel)) return { error: `${code} only works on ${c.channels.map((ch) => (ch === 'WEB' ? 'web store' : 'manual')).join(' and ')} orders.` };
  if (c.customerGroupIds.length && (!ctx.customerGroupId || !c.customerGroupIds.includes(ctx.customerGroupId))) return { error: `${code} isn’t available to this customer’s group.` };

  const mine = ctx.orderId ? await db.couponRedemption.findFirst({ where: { couponId: c.id, orderId: ctx.orderId }, select: { id: true } }) : null;
  if (!mine && c.usageLimit != null && c.usedCount >= c.usageLimit) return { error: `${code} has been used ${c.usageLimit} times, which is its limit.` };
  if (c.perCustomerLimit != null) {
    const used = await db.couponRedemption.count({ where: { couponId: c.id, customerId: ctx.customerId, ...(ctx.orderId ? { orderId: { not: ctx.orderId } } : {}) } });
    if (used >= c.perCustomerLimit) return { error: `This customer has already used ${code} ${used === 1 ? 'once' : `${used} times`}, its limit.` };
  }
  if (c.firstOrderOnly) {
    const earlier = await db.order.count({ where: { customerId: ctx.customerId, status: { notIn: ['CANCELLED', 'DRAFT'] }, ...(ctx.orderId ? { id: { not: ctx.orderId } } : {}) } });
    const invoiced = await db.invoice.count({ where: { customerId: ctx.customerId } });
    if (earlier + invoiced > 0) return { error: `${code} is for a customer’s first order.` };
  }
  return { coupon: c, rule: toRule(c) };
}

/** Records one use of a coupon on an order. The count goes up only while
 * it's under the limit, in one statement, so two orders can't both take the
 * last use. Throws a user-facing error when the limit was just reached. */
export async function redeemCoupon(db: Tx, input: { couponId: string; orderId: string; customerId: string; amount: number }): Promise<void> {
  const companyId = await currentCompanyId();
  const updated = await db.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = ${input.couponId} AND "companyId" = ${companyId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
  if (updated === 0) throw new Error('That coupon has just reached its usage limit. Remove it and try again.');
  await db.couponRedemption.create({ data: { couponId: input.couponId, orderId: input.orderId, customerId: input.customerId, amount: input.amount } });
}

/** Gives back an order's coupon use (cancelled order, or coupon removed). */
export async function releaseCoupon(db: Tx, orderId: string): Promise<void> {
  const r = await db.couponRedemption.findUnique({ where: { orderId } });
  if (!r) return;
  const companyId = await currentCompanyId();
  await db.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE "id" = ${r.couponId} AND "companyId" = ${companyId}`;
  await db.couponRedemption.delete({ where: { orderId } });
}

/** Read-only client for code paths outside a transaction. */
export const discountsDb: Tx = prisma;
