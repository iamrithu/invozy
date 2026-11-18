import { Prisma, type Company, type OrderChannel, type OrderSource } from '@prisma/client';
import type { Tx } from '@/lib/prisma';
import { priceOrder, type PriceLine, type PriceResult } from '@/lib/pricing';
import { findCouponForOrder, liveAutomaticDiscounts } from '@/lib/discounts';

// Prices an order against the database: its customer, its products'
// categories, the automatic discounts live now and the coupon entered.
// Shared by staff orders (src/actions/orders.ts) and web store checkout
// (src/actions/store.ts). Server-only: not a 'use server' module, so none
// of this is callable from the browser.

export type PricingCompany = Pick<Company, 'id' | 'state' | 'cgstRate' | 'sgstRate' | 'igstRate' | 'cgstEnabled' | 'sgstEnabled' | 'igstEnabled'> & {
  /** The company's switched-off modules: without 'marketing', no coupons or automatic discounts apply. */
  disabledModules: readonly string[];
};

export type PricingInput = {
  customerId: string | null;
  channel: OrderChannel;
  lines: { productId: string | null; name: string; unit: string; qty: number; rate: number; discount: number }[];
  couponCode?: string | null;
  deliveryCharge: number;
};

export type Priced = {
  price: PriceResult;
  couponId: string | null;
  couponError: string | null;
  customer: { id: string; name: string; shopName: string | null; state: string; terms: string; creditLimit: Prisma.Decimal; active: boolean; phone: string | null; address: string | null; pincode: string | null; groupId: string | null };
};

export const sourceOf = (channel: OrderChannel): OrderSource => (channel === 'STOREFRONT' ? 'WEB' : 'MANUAL');

/** Stands in for a web store visitor who isn't a customer yet: limits and
 * first-order checks treat them as new. Never written anywhere. */
const NEW_VISITOR_ID = 'new-visitor';

export async function priceFor(db: Tx, data: PricingInput, company: PricingCompany, orderId?: string | null, visitor?: { state: string }): Promise<Priced | { error: string }> {
  const customer =
    !data.customerId && visitor
      ? { id: NEW_VISITOR_ID, name: 'New customer', shopName: null, state: visitor.state, terms: 'Due on receipt', creditLimit: new Prisma.Decimal(0), active: true, phone: null, address: null, pincode: null, groupId: null }
      : await db.customer.findUnique({
          where: { id: data.customerId ?? '' },
          select: { id: true, name: true, shopName: true, state: true, terms: true, creditLimit: true, active: true, phone: true, address: true, pincode: true, groupId: true },
        });
  if (!customer) return { error: 'That customer no longer exists.' };
  const productIds = data.lines.map((l) => l.productId).filter((id): id is string => !!id);
  const products = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  if (productIds.some((id) => !byId.has(id))) return { error: 'One of the products no longer exists. Remove it and add it again.' };
  const lines: PriceLine[] = data.lines.map((l) => ({
    productId: l.productId,
    categoryId: l.productId ? byId.get(l.productId)?.categoryId ?? null : null,
    name: l.name,
    unit: l.unit,
    qty: l.qty,
    rate: l.rate,
    discount: l.discount,
  }));
  const source = sourceOf(data.channel);
  const discountsOn = !company.disabledModules.includes('marketing');
  const automatic = discountsOn ? await liveAutomaticDiscounts(db, source, customer.groupId) : [];
  let couponId: string | null = null;
  let couponRule = null;
  let couponError: string | null = null;
  if (data.couponCode?.trim() && !discountsOn) couponError = 'Coupons aren’t available.';
  else if (data.couponCode?.trim()) {
    const found = await findCouponForOrder(db, data.couponCode, { channel: source, customerId: customer.id, customerGroupId: customer.groupId, orderId });
    if ('error' in found) couponError = found.error;
    else {
      couponId = found.coupon.id;
      couponRule = found.rule;
    }
  }
  const price = priceOrder({
    lines,
    deliveryCharge: data.deliveryCharge,
    automatic,
    coupon: couponRule,
    gst: {
      cgstRate: Number(company.cgstRate),
      sgstRate: Number(company.sgstRate),
      igstRate: Number(company.igstRate),
      cgstEnabled: company.cgstEnabled,
      sgstEnabled: company.sgstEnabled,
      igstEnabled: company.igstEnabled,
    },
    companyState: company.state,
    customerState: customer.state,
  });
  if (price.couponError) {
    couponError = price.couponError;
    couponId = null;
  }
  return { price, couponId, couponError, customer };
}

/** The order's money columns from a pricing result. */
export function moneyColumns(p: Priced) {
  const t = p.price.totals;
  return {
    subtotal: p.price.subtotal,
    autoDiscountLabel: p.price.auto?.rule.title ?? null,
    autoDiscount: p.price.auto?.amount ?? 0,
    couponId: p.couponId,
    couponCode: p.price.coupon?.rule.code ?? null,
    couponDiscount: p.price.coupon?.amount ?? 0,
    deliveryCharge: p.price.deliveryCharge,
    taxable: t.taxable,
    cgst: t.cgst,
    sgst: t.sgst,
    igst: t.igst,
    total: t.total,
    interState: t.useIgst,
  };
}

/** Takes the company's next order number (row-locked increment). */
export async function claimOrderNumber(tx: Tx, companyId: string): Promise<string> {
  const c = await tx.company.update({ where: { id: companyId }, data: { nextOrderNo: { increment: 1 } }, select: { orderPrefix: true, nextOrderNo: true } });
  return `${c.orderPrefix}-${c.nextOrderNo - 1}`;
}
