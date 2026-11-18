'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { runWithTenant } from '@/lib/tenant';
import { findOpenStore } from '@/lib/store-public';
import { readStoreSettings, earliestDeliveryDate } from '@/lib/store-settings';
import { claimOrderNumber, moneyColumns, priceFor } from '@/lib/order-pricing';
import { redeemCoupon } from '@/lib/discounts';
import { createSignedToken } from '@/lib/signed-token';
import { consumeRateLimit } from '@/lib/login-rate-limit';
import { requestIp } from '@/lib/request-ip';
import { normalizePhone, PHONE_RE } from '@/lib/login-identifiers';
import { gstStateCode } from '@/lib/gst-state-codes';
import { logActivity } from '@/lib/activity';

// Public web store checkout (/s/<slug>/checkout). No login: everything runs
// for the store's company only (runWithTenant). Prices always come from the
// catalog on the server — never from the browser — and orders arrive in
// Sales › Orders as New (or Confirmed, if the company auto-confirms).

const CartSchema = z.array(z.object({ productId: z.string().min(1), unit: z.string().min(1).max(40), qty: z.coerce.number().positive().max(100_000) })).min(1, 'Your cart is empty.').max(100);

const CheckoutSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  shopName: z.string().trim().max(120).optional().nullable(),
  phone: z
    .string()
    .trim()
    .transform((v) => normalizePhone(v))
    .refine((v) => PHONE_RE.test(v), 'Enter a valid phone number.'),
  address: z.string().trim().min(5, 'Enter the delivery address.').max(300),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit PIN code.'),
  state: z.string().trim().refine((s) => gstStateCode(s) !== '99', 'Pick your state.'),
  gstin: z.string().trim().toUpperCase().max(15).optional().nullable(),
  cart: CartSchema,
  couponCode: z.string().trim().max(40).optional().nullable(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  slot: z.string().trim().max(40).optional().nullable(),
  payment: z.enum(['COD', 'UPI']),
  notes: z.string().trim().max(500).optional().nullable(),
  /** Bot trap: a real browser leaves it empty. */
  website: z.string().max(0).optional(),
});

export type CheckoutInput = z.input<typeof CheckoutSchema>;

export type StoreQuote = {
  subtotal: number;
  autoTitle: string | null;
  autoAmount: number;
  couponCode: string | null;
  couponAmount: number;
  couponError: string | null;
  deliveryCharge: number;
  deliveryWaived: number;
  tax: number;
  total: number;
  zoneName: string | null;
  /** Why the order can't be placed yet (zone, minimum order), if anything. */
  blocker: string | null;
};

type Lines = { productId: string; name: string; unit: string; qty: number; rate: number; discount: number }[];

/** The cart priced from the catalog: only active products in categories
 * that are open on the store. */
async function catalogLines(cart: z.infer<typeof CartSchema>): Promise<Lines | { error: string }> {
  const ids = Array.from(new Set(cart.map((c) => c.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, active: true, categoryRef: { is: { deletedAt: null, status: 'ACTIVE', showOnStore: true } } },
    select: { id: true, name: true, unit: true, price: true, priceTiers: { select: { unit: true, price: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: Lines = [];
  for (const c of cart) {
    const p = byId.get(c.productId);
    if (!p) return { error: 'Something in your cart is no longer sold here. Remove it and try again.' };
    const tier = p.priceTiers.find((t) => t.unit === c.unit) ?? (p.unit === c.unit ? { unit: p.unit, price: p.price } : null);
    if (!tier) return { error: `${p.name} isn’t sold by the ${c.unit} any more. Remove it and add it again.` };
    lines.push({ productId: p.id, name: p.name, unit: tier.unit, qty: c.qty, rate: Number(tier.price), discount: 0 });
  }
  return lines;
}

/** Delivery for a PIN code: the zone covering it, or none (when zones are
 * set up and none covers it, the store doesn't deliver there). */
async function zoneFor(pincode: string | null | undefined) {
  const zones = await prisma.deliveryZone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  if (!zones.length) return { zones: 0, zone: null };
  const zone = pincode ? zones.find((z) => z.pincodes.includes(pincode)) ?? null : null;
  return { zones: zones.length, zone };
}

async function quoteInTenant(company: NonNullable<Awaited<ReturnType<typeof findOpenStore>>>, input: { cart: unknown; pincode?: string | null; state?: string | null; couponCode?: string | null; phone?: string | null }): Promise<{ quote?: StoreQuote; error?: string; customerId?: string | null }> {
  const cart = CartSchema.safeParse(input.cart);
  if (!cart.success) return { error: cart.error.issues[0]?.message ?? 'Your cart is empty.' };
  const lines = await catalogLines(cart.data);
  if ('error' in lines) return { error: lines.error };
  const settings = readStoreSettings(company.storeSettings);
  const { zones, zone } = await zoneFor(input.pincode);
  const goods = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const charge = zone ? (zone.freeAbove != null && goods >= Number(zone.freeAbove) ? 0 : Number(zone.charge)) : 0;
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const existing = phone && PHONE_RE.test(phone) ? await prisma.customer.findFirst({ where: { phone, active: true }, select: { id: true } }) : null;

  // Price against the real customer when we know them (their coupon use
  // counts), otherwise as a new visitor in the chosen state.
  const state = input.state && gstStateCode(input.state) !== '99' ? input.state : company.state;
  const priced = await priceFor(prisma, { customerId: existing?.id ?? null, channel: 'STOREFRONT', lines, couponCode: input.couponCode, deliveryCharge: charge }, company, null, { state });
  if ('error' in priced) return { error: priced.error };
  const t = priced.price.totals;
  const minOrder = Math.max(settings.minOrder, zone ? Number(zone.minOrder) : 0);
  const blocker =
    zones > 0 && input.pincode && !zone
      ? `Sorry, we don’t deliver to ${input.pincode} yet.`
      : minOrder > 0 && priced.price.subtotal < minOrder
        ? `The minimum order is ₹${minOrder.toLocaleString('en-IN')}. Add ₹${(minOrder - priced.price.subtotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })} more.`
        : null;
  return {
    customerId: existing?.id ?? null,
    quote: {
      subtotal: priced.price.subtotal,
      autoTitle: priced.price.auto?.rule.title ?? null,
      autoAmount: priced.price.auto?.amount ?? 0,
      couponCode: priced.price.coupon?.rule.code ?? null,
      couponAmount: priced.price.coupon?.amount ?? 0,
      couponError: input.couponCode?.trim() ? priced.couponError : null,
      deliveryCharge: priced.price.deliveryCharge,
      deliveryWaived: priced.price.deliveryWaived,
      tax: t.cgst + t.sgst + t.igst,
      total: t.total,
      zoneName: zone?.name ?? null,
      blocker,
    },
  };
}

/** Live totals for the checkout page. */
export async function quoteStoreOrder(slug: string, input: { cart: unknown; pincode?: string | null; state?: string | null; couponCode?: string | null; phone?: string | null }): Promise<{ quote?: StoreQuote; error?: string }> {
  try {
    const ip = await requestIp();
    if (ip && !(await consumeRateLimit(`store-quote:${ip}`, 300, 60 * 60 * 1000))) return { error: 'Too many requests. Please wait a few minutes.' };
    const company = await findOpenStore(slug);
    if (!company) return { error: 'This store isn’t taking orders right now.' };
    const r = await runWithTenant(company.id, () => quoteInTenant(company, input));
    return { quote: r.quote, error: r.error };
  } catch (e) {
    console.error('store quote failed', e);
    return { error: 'Something went wrong. Please try again.' };
  }
}

/** Places a web order. Returns its number and a private link to follow it. */
export async function placeStoreOrder(slug: string, input: CheckoutInput): Promise<{ error?: string; fieldErrors?: Record<string, string>; number?: string; token?: string }> {
  try {
    const ip = await requestIp();
    if (ip && !(await consumeRateLimit(`store-order:${ip}`, 15, 60 * 60 * 1000))) return { error: 'Too many orders from this network. Please try again later or call us.' };
    const parsed = CheckoutSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
      return { error: 'Check the highlighted details.', fieldErrors };
    }
    const d = parsed.data;
    const company = await findOpenStore(slug);
    if (!company) return { error: 'This store isn’t taking orders right now.' };
    const settings = readStoreSettings(company.storeSettings);
    if (d.payment === 'COD' && !settings.payCod) return { error: 'Cash on delivery isn’t available.' };
    if (d.payment === 'UPI' && !settings.payUpi) return { error: 'UPI on delivery isn’t available.' };

    return await runWithTenant(company.id, async () => {
      const lines = await catalogLines(d.cart);
      if ('error' in lines) return { error: lines.error };
      const { zones, zone } = await zoneFor(d.pincode);
      if (zones > 0 && !zone) return { error: `Sorry, we don’t deliver to ${d.pincode} yet.`, fieldErrors: { pincode: 'Outside our delivery area.' } };
      const goods = lines.reduce((s, l) => s + l.qty * l.rate, 0);
      const charge = zone ? (zone.freeAbove != null && goods >= Number(zone.freeAbove) ? 0 : Number(zone.charge)) : 0;
      const earliest = earliestDeliveryDate(settings);
      const date = d.deliveryDate && d.deliveryDate >= earliest ? d.deliveryDate : earliest;
      const slot = d.slot && settings.slots.includes(d.slot) ? d.slot : null;
      const confirmed = company.autoConfirmWebOrders;

      const order = await prisma.$transaction(async (tx) => {
        // A returning customer is matched by phone; a new one is added as a
        // customer so staff can see and bill them.
        let customer = await tx.customer.findFirst({ where: { phone: d.phone, active: true }, select: { id: true } });
        if (!customer) {
          customer = await tx.customer.create({
            data: { name: d.name, shopName: d.shopName || null, contact: d.name, phone: d.phone, address: d.address, pincode: d.pincode, state: d.state, gstin: d.gstin || null, terms: 'Due on receipt' },
            select: { id: true },
          });
        }
        const priced = await priceFor(tx, { customerId: customer.id, channel: 'STOREFRONT', lines, couponCode: d.couponCode, deliveryCharge: charge }, company);
        if ('error' in priced) throw new Error(priced.error);
        if (d.couponCode?.trim() && priced.couponError) throw new Error(priced.couponError);
        const minOrder = Math.max(settings.minOrder, zone ? Number(zone.minOrder) : 0);
        if (minOrder > 0 && priced.price.subtotal < minOrder) throw new Error(`The minimum order is ₹${minOrder.toLocaleString('en-IN')}.`);
        const number = await claimOrderNumber(tx, company.id);
        const created = await tx.order.create({
          data: {
            number,
            source: 'WEB',
            channel: 'STOREFRONT',
            status: confirmed ? 'CONFIRMED' : 'PENDING',
            confirmedAt: confirmed ? new Date() : null,
            customerId: customer.id,
            paymentMethod: d.payment,
            deliveryDate: new Date(`${date}T00:00:00+05:30`),
            deliverySlot: slot,
            notes: d.notes || null,
            shipName: d.shopName || d.name,
            shipPhone: d.phone,
            shipAddress: d.address,
            shipPincode: d.pincode,
            ...moneyColumns(priced),
            items: { create: lines.map((l, i) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: l.qty, rate: l.rate, discount: 0, sortOrder: i })) },
            events: {
              create: [
                { type: 'PLACED', message: `Placed on the web store by ${d.name} (${d.payment === 'COD' ? 'cash' : 'UPI'} on delivery)` },
                ...(priced.price.coupon ? [{ type: 'COUPON', message: `Coupon ${priced.price.coupon.rule.code} applied` }] : []),
                ...(confirmed ? [{ type: 'CONFIRMED', message: 'Confirmed automatically' }] : []),
              ],
            },
          },
          select: { id: true, number: true, customerId: true },
        });
        if (priced.couponId) await redeemCoupon(tx, { couponId: priced.couponId, orderId: created.id, customerId: created.customerId, amount: priced.price.coupon?.amount ?? 0 });
        return created;
      });

      await logActivity({ action: 'order.web', entityType: 'order', entityId: order.id, summary: `Web store order ${order.number} from ${d.name}` });
      revalidatePath('/orders');
      const token = await createSignedToken('store-order', order.id, 90 * 24 * 3600);
      return { number: order.number, token };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg && !/prisma|invalid `|connection|ECONN|timeout/i.test(msg)) return { error: msg };
    console.error('store order failed', e);
    return { error: 'Something went wrong placing your order. Please try again.' };
  }
}
