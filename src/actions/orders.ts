'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { InvoiceTrigger, OrderChannel, OrderSource, OrderStatus, Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { assertCanCreate } from '@/lib/subscription-guard';
import { todayIst } from '@/lib/dates';
import { fmtInr, isOverCreditLimit } from '@/lib/gst';
import { customerOutstanding } from '@/lib/invoice-totals';
import { dueDateFromTerms } from '@/lib/pricing';
import { redeemCoupon, releaseCoupon } from '@/lib/discounts';
import { claimOrderNumber, moneyColumns, priceFor, type Priced } from '@/lib/order-pricing';
import { createInvoice, recordPayment, type InvoiceInput } from '@/actions/invoices';

// Sales › Orders. An order is the sale before it is invoiced. Its GST
// invoice is generated from it — on confirm, on dispatch or by hand
// (Company.invoiceTrigger) — through createInvoice, so numbering, stock and
// the GST snapshot work exactly as for any other invoice.

const CHANNELS = ['PHONE', 'WHATSAPP', 'WALK_IN', 'SALES_REP', 'EMAIL', 'STOREFRONT'] as const;
const PAYMENT_METHODS = ['CREDIT', 'CASH', 'COD', 'UPI', 'ONLINE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const LineSchema = z.object({
  productId: z.string().nullable(),
  name: z.string().trim().min(1, 'needs a name'),
  unit: z.string().trim().min(1, 'needs a unit'),
  qty: z.coerce.number().positive('quantity must be more than zero'),
  rate: z.coerce.number().min(0, 'rate can’t be negative'),
  discount: z.coerce.number().min(0).max(100, 'discount must be between 0 and 100%').default(0),
  hsn: z.string().optional().nullable(),
});

const OrderInputSchema = z.object({
  customerId: z.string().min(1, 'Pick a customer'),
  channel: z.enum(CHANNELS).default('PHONE'),
  lines: z.array(LineSchema).min(1, 'Add at least one item'),
  couponCode: z.string().trim().max(40).optional().nullable(),
  deliveryCharge: z.coerce.number().min(0, 'The delivery charge can’t be negative').default(0),
  deliveryDate: z.string().optional().nullable(),
  deliverySlot: z.string().trim().max(60).optional().nullable(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CREDIT'),
  notes: z.string().trim().max(1000).optional().nullable(),
  shipName: z.string().trim().max(120).optional().nullable(),
  shipPhone: z.string().trim().max(20).optional().nullable(),
  shipAddress: z.string().trim().max(500).optional().nullable(),
  shipPincode: z.string().trim().max(10).optional().nullable(),
});

export type OrderInput = z.input<typeof OrderInputSchema>;
type ParsedOrder = z.output<typeof OrderInputSchema>;

function parse(input: OrderInput): { data: ParsedOrder } | { error: string } {
  const r = OrderInputSchema.safeParse(input);
  if (r.success) return { data: r.data };
  const issue = r.error.issues[0];
  if (issue?.path[0] === 'lines' && typeof issue.path[1] === 'number') {
    const name = input.lines?.[issue.path[1]]?.name;
    return { error: `Line ${issue.path[1] + 1}${name ? ` (${name})` : ''}: ${issue.message}` };
  }
  return { error: issue?.message ?? 'Check the order and try again.' };
}

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const sourceOf = (channel: OrderChannel): OrderSource => (channel === 'STOREFRONT' ? 'WEB' : 'MANUAL');

// ── Pricing (src/lib/order-pricing.ts) ─────────────────────────────────────

export type OrderQuote = {
  subtotal: number;
  auto: { title: string; amount: number } | null;
  coupon: { code: string; title: string; amount: number; freeDelivery: boolean } | null;
  couponError: string | null;
  deliveryCharge: number;
  deliveryWaived: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  useIgst: boolean;
  roundOff: number;
  total: number;
  creditWarning: string | null;
};

function quoteOf(p: Priced, outstanding: number): OrderQuote {
  const t = p.price.totals;
  const limit = Number(p.customer.creditLimit);
  return {
    subtotal: p.price.subtotal,
    auto: p.price.auto ? { title: p.price.auto.rule.title, amount: p.price.auto.amount } : null,
    coupon: p.price.coupon ? { code: p.price.coupon.rule.code ?? '', title: p.price.coupon.rule.title, amount: p.price.coupon.amount, freeDelivery: p.price.coupon.freeDelivery } : null,
    couponError: p.couponError,
    deliveryCharge: p.price.deliveryCharge,
    deliveryWaived: p.price.deliveryWaived,
    taxable: t.taxable,
    cgst: t.cgst,
    sgst: t.sgst,
    igst: t.igst,
    useIgst: t.useIgst,
    roundOff: t.roundOff,
    total: t.total,
    creditWarning: isOverCreditLimit(outstanding, t.total, limit) ? `Takes ${p.customer.shopName || p.customer.name} to ${fmtInr(outstanding + t.total)}, over the ${fmtInr(limit)} credit limit.` : null,
  };
}

/** Live price preview for the order form. The server always reprices on
 * save; this is only what the form shows while editing. */
export async function quoteOrder(input: OrderInput, orderId?: string | null): Promise<ActionResult<{ quote: OrderQuote }>> {
  try {
    await requireUser();
    const parsed = parse(input);
    if ('error' in parsed) return { error: parsed.error };
    const priced = await priceFor(prisma, parsed.data, await getCompany(), orderId);
    if ('error' in priced) return { error: priced.error };
    const outstanding = Number(priced.customer.creditLimit) > 0 ? await customerOutstanding(priced.customer.id) : 0;
    return { quote: quoteOf(priced, outstanding) };
  } catch (e) {
    return toActionError(e);
  }
}

function itemRows(data: ParsedOrder) {
  return data.lines.map((l, i) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: l.qty, rate: l.rate, discount: l.discount, hsn: blank(l.hsn), sortOrder: i }));
}

function shipFields(data: ParsedOrder, customer: Priced['customer']) {
  return {
    shipName: blank(data.shipName) ?? (customer.shopName || customer.name),
    shipPhone: blank(data.shipPhone) ?? customer.phone,
    shipAddress: blank(data.shipAddress) ?? customer.address,
    shipPincode: blank(data.shipPincode) ?? customer.pincode,
  };
}

const CHANNEL_LABEL: Record<OrderChannel, string> = { STOREFRONT: 'web store', PHONE: 'phone', WHATSAPP: 'WhatsApp', WALK_IN: 'walk-in', SALES_REP: 'sales rep', EMAIL: 'email' };

// ── Create / edit ──────────────────────────────────────────────────────────

export type SaveMode = 'draft' | 'order' | 'invoice' | 'quick';
export type OrderSaveResult = { error?: string; warning?: string; id?: string; number?: string; invoiceNumber?: string };

/** Creates a manual order. `draft` saves it unconfirmed; `order` confirms
 * it; `invoice` confirms and generates the invoice; `quick` (counter sale)
 * also marks it delivered, and paid when `paid` is set. */
export async function createOrder(
  input: OrderInput,
  mode: SaveMode = 'order',
  opts: { paid?: boolean; paymentMode?: string | null; allowNegativeStock?: boolean } = {}
): Promise<OrderSaveResult> {
  try {
    const user = await requireUser();
    await assertCanCreate('order');
    const parsed = parse(input);
    if ('error' in parsed) return { error: parsed.error };
    const data = parsed.data;
    if (data.channel === 'STOREFRONT') return { error: 'Web store orders are placed on the store.' };

    const company = await getCompany();
    const order = await prisma.$transaction(async (tx) => {
      const priced = await priceFor(tx, data, company);
      if ('error' in priced) throw new Error(priced.error);
      if (data.couponCode?.trim() && priced.couponError) throw new Error(priced.couponError);
      if (!priced.customer.active) throw new Error(`${priced.customer.shopName || priced.customer.name} is disabled. Enable them in Customers first.`);
      const number = await claimOrderNumber(tx, company.id);
      const confirmed = mode !== 'draft';
      const now = new Date();
      const created = await tx.order.create({
        data: {
          number,
          source: 'MANUAL',
          channel: data.channel,
          status: confirmed ? 'CONFIRMED' : 'DRAFT',
          customerId: priced.customer.id,
          paymentMethod: data.paymentMethod,
          deliveryDate: data.deliveryDate ? new Date(`${data.deliveryDate}T00:00:00+05:30`) : null,
          deliverySlot: blank(data.deliverySlot),
          notes: blank(data.notes),
          ...shipFields(data, priced.customer),
          ...moneyColumns(priced),
          createdById: user.id,
          confirmedAt: confirmed ? now : null,
          items: { create: itemRows(data) },
          events: {
            create: [
              { type: 'CREATED', message: `Created by ${user.name || 'staff'} (${CHANNEL_LABEL[data.channel]} order)`, userId: user.id },
              ...(priced.price.auto ? [{ type: 'COUPON', message: `${priced.price.auto.rule.title} discount applied automatically`, userId: user.id }] : []),
              ...(priced.price.coupon ? [{ type: 'COUPON', message: `Coupon ${priced.price.coupon.rule.code} applied`, userId: user.id }] : []),
              ...(confirmed ? [{ type: 'CONFIRMED', message: 'Confirmed', userId: user.id }] : []),
            ],
          },
        },
        select: { id: true, number: true, customerId: true },
      });
      if (priced.couponId) await redeemCoupon(tx, { couponId: priced.couponId, orderId: created.id, customerId: created.customerId, amount: priced.price.coupon?.amount ?? 0 });
      return created;
    });

    await logActivity({ userId: user.id, action: 'order.create', entityType: 'order', entityId: order.id, summary: `Created order ${order.number}` });
    revalidatePath('/orders');

    let invoiceNumber: string | undefined;
    let warning: string | undefined;
    if (mode === 'invoice' || mode === 'quick' || (mode === 'order' && company.invoiceTrigger === 'ON_CONFIRM')) {
      const gen = await generateFor(order.id, user.id, mode === 'quick' ? 'quick sale' : mode === 'invoice' ? 'with the order' : 'on confirm', {
        paid: mode === 'quick' && !!opts.paid,
        paymentMode: opts.paymentMode ?? null,
        allowNegativeStock: opts.allowNegativeStock,
      });
      if (gen.error) warning = `The order is saved, but the invoice wasn’t generated: ${gen.error}`;
      else {
        invoiceNumber = gen.number;
        warning = gen.warning;
        if (mode === 'quick') {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: 'DELIVERED',
              deliveredAt: new Date(),
              events: { create: { type: 'DELIVERED', message: opts.paid ? `Handed over at the counter, paid (${opts.paymentMode || 'Cash'})` : 'Handed over at the counter', userId: user.id } },
            },
          });
        }
      }
    }
    return { id: order.id, number: order.number, invoiceNumber, warning };
  } catch (e) {
    return toActionError(e);
  }
}

const EDITABLE: OrderStatus[] = ['DRAFT', 'PENDING', 'CONFIRMED', 'PACKED'];

/** Edits an order until its invoice exists. The coupon is re-checked and
 * its use moved if it changed. */
export async function updateOrder(id: string, input: OrderInput): Promise<OrderSaveResult> {
  try {
    const user = await requireUser();
    const parsed = parse(input);
    if ('error' in parsed) return { error: parsed.error };
    const data = parsed.data;
    const existing = await prisma.order.findUnique({ where: { id }, select: { status: true, invoiceId: true, number: true, couponId: true, channel: true, source: true } });
    if (!existing) return { error: 'That order no longer exists.' };
    if (existing.invoiceId) return { error: `${existing.number} is already invoiced. Change it with a return (credit note) instead.` };
    if (!EDITABLE.includes(existing.status)) return { error: `A ${existing.status.toLowerCase().replace(/_/g, ' ')} order can’t be edited.` };
    // An order keeps where it came from.
    const keepChannel = { ...data, channel: existing.channel } as ParsedOrder;

    const company = await getCompany();
    await prisma.$transaction(async (tx) => {
      const priced = await priceFor(tx, keepChannel, company, id);
      if ('error' in priced) throw new Error(priced.error);
      if (data.couponCode?.trim() && priced.couponError) throw new Error(priced.couponError);
      if (existing.couponId !== priced.couponId) await releaseCoupon(tx, id);
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.order.update({
        where: { id },
        data: {
          customerId: priced.customer.id,
          paymentMethod: data.paymentMethod,
          deliveryDate: data.deliveryDate ? new Date(`${data.deliveryDate}T00:00:00+05:30`) : null,
          deliverySlot: blank(data.deliverySlot),
          notes: blank(data.notes),
          ...shipFields(keepChannel, priced.customer),
          ...moneyColumns(priced),
          items: { create: itemRows(keepChannel) },
          events: { create: { type: 'EDITED', message: 'Edited', userId: user.id } },
        },
      });
      if (priced.couponId && existing.couponId !== priced.couponId) {
        await redeemCoupon(tx, { couponId: priced.couponId, orderId: id, customerId: priced.customer.id, amount: priced.price.coupon?.amount ?? 0 });
      } else if (priced.couponId) {
        await tx.couponRedemption.updateMany({ where: { orderId: id }, data: { amount: priced.price.coupon?.amount ?? 0, customerId: priced.customer.id } });
      }
    });
    await logActivity({ userId: user.id, action: 'order.update', entityType: 'order', entityId: id, summary: `Edited order ${existing.number}` });
    revalidatePath('/orders');
    return { id, number: existing.number };
  } catch (e) {
    return toActionError(e);
  }
}

// ── Invoice generation ─────────────────────────────────────────────────────

const CLAIM_MS = 2 * 60 * 1000;

/** Builds the invoice from the order through createInvoice. Claims the
 * order first so a double click can't make two invoices. */
async function generateFor(
  orderId: string,
  userId: string,
  why: string,
  opts: { paid?: boolean; paymentMode?: string | null; allowNegativeStock?: boolean } = {}
): Promise<{ error?: string; warning?: string; invoiceId?: string; number?: string }> {
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, invoiceId: null, OR: [{ invoicingAt: null }, { invoicingAt: { lt: new Date(Date.now() - CLAIM_MS) } }] },
    data: { invoicingAt: new Date() },
  });
  if (!claimed.count) {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { invoice: { select: { id: true, number: true } } } });
    return o?.invoice ? { invoiceId: o.invoice.id, number: o.invoice.number } : { error: 'An invoice is already being generated for this order.' };
  }
  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { orderBy: { sortOrder: 'asc' } }, customer: { select: { terms: true } } } });
    if (order.status === 'DRAFT' || order.status === 'PENDING' || order.status === 'CANCELLED') return { error: 'Confirm the order first.' };
    const company = await getCompany();
    const today = todayIst();
    const deliveryCharge = Number(order.deliveryCharge);
    const input: InvoiceInput = {
      customerId: order.customerId,
      date: today,
      due: dueDateFromTerms(order.customer.terms, today),
      items: [
        ...order.items.map((i) => ({ productId: i.productId, name: i.name, unit: i.unit, qty: Number(i.qty), rate: Number(i.rate), discount: Number(i.discount), hsn: i.hsn })),
        ...(deliveryCharge > 0 ? [{ productId: null, name: 'Delivery charges', unit: 'trip', qty: 1, rate: deliveryCharge, discount: 0 }] : []),
      ],
      overallDiscountType: 'FLAT',
      overallDiscountValue: Number(order.autoDiscount) + Number(order.couponDiscount),
      notes: [order.couponCode ? `Coupon ${order.couponCode}` : null, order.autoDiscountLabel ? `${order.autoDiscountLabel} discount` : null].filter(Boolean).join(' · ') || null,
      deliveryInstructions: order.notes,
      showTransportDetails: !!order.vehicleNo,
      transportVehicleNo: order.vehicleNo,
      transportDriverName: order.driverName,
      transportDriverPhone: order.driverPhone,
      markSent: true,
      markPaid: !!opts.paid,
      paymentMode: opts.paymentMode ?? null,
      allowNegativeStock: !!opts.allowNegativeStock,
      cgstRate: Number(company.cgstRate),
      sgstRate: Number(company.sgstRate),
      igstRate: Number(company.igstRate),
      cgstEnabled: company.cgstEnabled,
      sgstEnabled: company.sgstEnabled,
      igstEnabled: company.igstEnabled,
      showBankDetails: company.pdfShowBankDetails,
      showHsnSummary: company.pdfShowHsnSummary,
      showUpiQr: company.showUpiQr,
      showGpayNumber: company.showGpayNumber,
    };
    const res = await createInvoice(input);
    if (res.error || !res.invoiceId) return { error: res.error ?? 'The invoice couldn’t be generated.' };
    await prisma.order.update({
      where: { id: orderId },
      data: { invoiceId: res.invoiceId, invoicingAt: null, events: { create: { type: 'INVOICED', message: `Invoice ${res.number} generated (${why})`, userId } } },
    });
    revalidatePath('/orders');
    return { invoiceId: res.invoiceId, number: res.number, warning: res.warning };
  } finally {
    await prisma.order.updateMany({ where: { id: orderId, invoiceId: null }, data: { invoicingAt: null } });
  }
}

export async function generateOrderInvoice(id: string, opts: { allowNegativeStock?: boolean } = {}): Promise<OrderSaveResult> {
  try {
    const user = await requireUser();
    const gen = await generateFor(id, user.id, 'by hand', opts);
    if (gen.error) return { error: gen.error };
    return { id, invoiceNumber: gen.number, warning: gen.warning };
  } catch (e) {
    return toActionError(e);
  }
}

// ── Status changes ─────────────────────────────────────────────────────────

async function load(id: string) {
  const o = await prisma.order.findUnique({ where: { id }, select: { id: true, number: true, status: true, invoiceId: true, total: true } });
  if (!o) throw new Error('That order no longer exists.');
  return o;
}

async function moveTo(id: string, from: OrderStatus[], to: OrderStatus, event: { type: string; message: string }, extra: Prisma.OrderUpdateInput = {}) {
  const user = await requireUser();
  const o = await load(id);
  if (!from.includes(o.status)) throw new Error(`${o.number} is ${o.status.toLowerCase().replace(/_/g, ' ')}, so it can’t be ${to.toLowerCase().replace(/_/g, ' ')}.`);
  await prisma.order.update({ where: { id }, data: { status: to, ...extra, events: { create: { ...event, userId: user.id } } } });
  await logActivity({ userId: user.id, action: `order.${to.toLowerCase()}`, entityType: 'order', entityId: id, summary: `${o.number}: ${event.message}` });
  revalidatePath('/orders');
  return { user, order: o };
}

export async function confirmOrder(id: string): Promise<OrderSaveResult> {
  try {
    const { user, order } = await moveTo(id, ['DRAFT', 'PENDING'], 'CONFIRMED', { type: 'CONFIRMED', message: 'Confirmed' }, { confirmedAt: new Date() });
    const company = await getCompany();
    if (company.invoiceTrigger === 'ON_CONFIRM') {
      const gen = await generateFor(id, user.id, 'on confirm');
      if (gen.error) return { id, warning: `Confirmed, but the invoice wasn’t generated: ${gen.error}` };
      return { id, number: order.number, invoiceNumber: gen.number, warning: gen.warning };
    }
    return { id, number: order.number };
  } catch (e) {
    return toActionError(e);
  }
}

/** Confirms several orders at once (Orders › New). */
export async function confirmOrders(ids: string[]): Promise<ActionResult<{ confirmed: number; warnings: string[] }>> {
  let confirmed = 0;
  const warnings: string[] = [];
  for (const id of ids.slice(0, 100)) {
    const r = await confirmOrder(id);
    if (r.error) warnings.push(r.error);
    else {
      confirmed++;
      if (r.warning) warnings.push(r.warning);
    }
  }
  return { confirmed, warnings };
}

export async function generateOrderInvoices(ids: string[]): Promise<ActionResult<{ generated: number; warnings: string[] }>> {
  let generated = 0;
  const warnings: string[] = [];
  for (const id of ids.slice(0, 100)) {
    const r = await generateOrderInvoice(id);
    if (r.error) warnings.push(r.error);
    else generated++;
  }
  return { generated, warnings };
}

export async function packOrder(id: string): Promise<OrderSaveResult> {
  try {
    await moveTo(id, ['CONFIRMED'], 'PACKED', { type: 'PACKED', message: 'Packed' }, { packedAt: new Date() });
    return { id };
  } catch (e) {
    return toActionError(e);
  }
}

/** Sends the order out. With the "on dispatch" setting (or `generateInvoice`)
 * the invoice is generated first, with the vehicle and driver on it; if
 * that fails the order stays where it was — goods shouldn't leave without
 * their invoice. */
export async function dispatchOrder(
  id: string,
  input: { vehicleNo?: string | null; driverName?: string | null; driverPhone?: string | null; generateInvoice?: boolean; allowNegativeStock?: boolean }
): Promise<OrderSaveResult> {
  try {
    const user = await requireUser();
    const o = await load(id);
    if (!['CONFIRMED', 'PACKED'].includes(o.status)) return { error: `${o.number} can’t be dispatched while it’s ${o.status.toLowerCase().replace(/_/g, ' ')}.` };
    const transport = { vehicleNo: blank(input.vehicleNo), driverName: blank(input.driverName), driverPhone: blank(input.driverPhone) };
    await prisma.order.update({ where: { id }, data: transport });
    const company = await getCompany();
    let invoiceNumber: string | undefined;
    let warning: string | undefined;
    if (!o.invoiceId && (company.invoiceTrigger === 'ON_DISPATCH' || input.generateInvoice)) {
      const gen = await generateFor(id, user.id, 'on dispatch', { allowNegativeStock: input.allowNegativeStock });
      if (gen.error) return { error: `Not dispatched: the invoice couldn’t be generated. ${gen.error}` };
      invoiceNumber = gen.number;
      warning = gen.warning;
    } else if (o.invoiceId && transport.vehicleNo) {
      await prisma.invoice.update({
        where: { id: o.invoiceId },
        data: { showTransportDetails: true, transportVehicleNo: transport.vehicleNo, transportDriverName: transport.driverName, transportDriverPhone: transport.driverPhone },
      });
    }
    const who = [transport.vehicleNo && `on ${transport.vehicleNo}`, transport.driverName && `with ${transport.driverName}`].filter(Boolean).join(' ');
    await moveTo(id, ['CONFIRMED', 'PACKED'], 'OUT_FOR_DELIVERY', { type: 'DISPATCHED', message: `Dispatched${who ? ` ${who}` : ''}` }, { dispatchedAt: new Date() });
    return { id, invoiceNumber, warning };
  } catch (e) {
    return toActionError(e);
  }
}

/** Marks it delivered; `collected` records the balance as paid on its
 * invoice (cash or UPI on delivery). */
export async function deliverOrder(id: string, input: { collected?: boolean; mode?: string | null } = {}): Promise<OrderSaveResult> {
  try {
    const o = await load(id);
    if (!['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'].includes(o.status)) return { error: `${o.number} can’t be marked delivered while it’s ${o.status.toLowerCase().replace(/_/g, ' ')}.` };
    let warning: string | undefined;
    if (input.collected) {
      if (!o.invoiceId) return { error: 'Generate the invoice first, so the payment has somewhere to go.' };
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: o.invoiceId }, select: { total: true, amountPaid: true } });
      const balance = Math.round((Number(inv.total) - Number(inv.amountPaid)) * 100) / 100;
      if (balance > 0) {
        const paid = await recordPayment(o.invoiceId, { amount: balance, date: todayIst(), mode: input.mode || 'Cash' });
        if (paid.error) warning = `Delivered, but the payment wasn’t recorded: ${paid.error}`;
      }
    }
    await moveTo(id, ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'], 'DELIVERED', { type: 'DELIVERED', message: input.collected ? `Delivered. Payment collected (${input.mode || 'Cash'})` : 'Delivered' }, { deliveredAt: new Date() });
    return { id, warning };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelOrder(id: string, reason: string): Promise<OrderSaveResult> {
  try {
    const user = await requireUser();
    const o = await load(id);
    if (o.status === 'CANCELLED') return { error: `${o.number} is already cancelled.` };
    if (o.status === 'DELIVERED') return { error: `${o.number} was delivered. Record a return instead.` };
    if (o.invoiceId) return { error: `${o.number} already has an invoice. Raise a credit note for it in Returns, or delete the invoice, then cancel.` };
    const why = reason.trim().slice(0, 200) || 'No reason given';
    await prisma.$transaction(async (tx) => {
      await releaseCoupon(tx, id);
      await tx.order.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: why, events: { create: { type: 'CANCELLED', message: `Cancelled: ${why}`, userId: user.id } } } });
    });
    await logActivity({ userId: user.id, action: 'order.cancel', entityType: 'order', entityId: id, summary: `Cancelled order ${o.number}: ${why}` });
    revalidatePath('/orders');
    return { id };
  } catch (e) {
    return toActionError(e);
  }
}

/** Deletes a draft that was never confirmed. */
export async function deleteDraftOrder(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const o = await load(id);
    if (o.status !== 'DRAFT') return { error: 'Only drafts can be deleted. Cancel the order instead.' };
    await prisma.$transaction(async (tx) => {
      await releaseCoupon(tx, id);
      await tx.order.delete({ where: { id } });
    });
    await logActivity({ userId: user.id, action: 'order.delete', entityType: 'order', entityId: id, summary: `Deleted draft order ${o.number}` });
    revalidatePath('/orders');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

// ── Reading ────────────────────────────────────────────────────────────────

export type OrderTab = 'all' | 'new' | 'dispatch' | 'out' | 'delivered' | 'cancelled' | 'drafts';
const TAB_WHERE: Record<OrderTab, Prisma.OrderWhereInput> = {
  all: { status: { not: 'DRAFT' } },
  new: { status: 'PENDING' },
  dispatch: { status: { in: ['CONFIRMED', 'PACKED'] } },
  out: { status: 'OUT_FOR_DELIVERY' },
  delivered: { status: 'DELIVERED' },
  cancelled: { status: 'CANCELLED' },
  drafts: { status: 'DRAFT' },
};

export type OrderListRow = {
  id: string;
  number: string;
  createdAt: string;
  source: OrderSource;
  channel: OrderChannel;
  status: OrderStatus;
  customerName: string;
  itemCount: number;
  total: number;
  paymentMethod: string;
  deliverySlot: string | null;
  deliveryDate: string | null;
  invoice: { id: string; number: string; status: string } | null;
  couponCode: string | null;
};

export async function listOrders(opts: { tab?: OrderTab; source?: OrderSource | 'all'; search?: string; page?: number; pageSize?: number } = {}): Promise<{ rows: OrderListRow[]; total: number; counts: Record<OrderTab, number> }> {
  await requireUser();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const q = opts.search?.trim();
  const base: Prisma.OrderWhereInput = {
    ...(opts.source && opts.source !== 'all' ? { source: opts.source } : {}),
    ...(q
      ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }, { customer: { shopName: { contains: q, mode: 'insensitive' } } }, { shipPhone: { contains: q } }] }
      : {}),
  };
  const where = { ...base, ...TAB_WHERE[opts.tab ?? 'all'] };
  const [rows, total, grouped] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { customer: { select: { name: true, shopName: true } }, invoice: { select: { id: true, number: true, status: true } }, _count: { select: { items: true } } },
    }),
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
  ]);
  const by = (s: OrderStatus[]) => grouped.filter((g) => s.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  return {
    rows: rows.map((o) => ({
      id: o.id,
      number: o.number,
      createdAt: o.createdAt.toISOString(),
      source: o.source,
      channel: o.channel,
      status: o.status,
      customerName: o.customer.shopName || o.customer.name,
      itemCount: o._count.items,
      total: Number(o.total),
      paymentMethod: o.paymentMethod,
      deliverySlot: o.deliverySlot,
      deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString() : null,
      invoice: o.invoice,
      couponCode: o.couponCode,
    })),
    total,
    counts: {
      all: by(['PENDING', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
      new: by(['PENDING']),
      dispatch: by(['CONFIRMED', 'PACKED']),
      out: by(['OUT_FOR_DELIVERY']),
      delivered: by(['DELIVERED']),
      cancelled: by(['CANCELLED']),
      drafts: by(['DRAFT']),
    },
  };
}

export type OrderView = {
  id: string;
  number: string;
  source: OrderSource;
  channel: OrderChannel;
  status: OrderStatus;
  createdAt: string;
  paymentMethod: string;
  deliveryDate: string | null;
  deliverySlot: string | null;
  shipName: string | null;
  shipPhone: string | null;
  shipAddress: string | null;
  shipPincode: string | null;
  notes: string | null;
  subtotal: number;
  autoDiscountLabel: string | null;
  autoDiscount: number;
  couponCode: string | null;
  couponDiscount: number;
  deliveryCharge: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  interState: boolean;
  vehicleNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  cancelReason: string | null;
  items: { id: string; productId: string | null; name: string; unit: string; qty: number; rate: number; discount: number; hsn: string | null; category: string | null }[];
  events: { id: string; type: string; message: string; createdAt: string }[];
  customer: { id: string; name: string; shopName: string | null; phone: string | null; gstin: string | null; state: string; address: string | null; terms: string; route: string | null; creditLimit: number };
  invoice: { id: string; number: string; status: string; total: number; amountPaid: number } | null;
};

export async function getOrder(id: string): Promise<OrderView | null> {
  await requireUser();
  const o = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: 'asc' }, include: { product: { select: { category: true } } } },
      events: { orderBy: { createdAt: 'desc' } },
      customer: { select: { id: true, name: true, shopName: true, phone: true, gstin: true, state: true, address: true, terms: true, route: true, creditLimit: true } },
      invoice: { select: { id: true, number: true, status: true, total: true, amountPaid: true } },
    },
  });
  if (!o) return null;
  const n = (v: Prisma.Decimal | number) => Number(v);
  return {
    id: o.id,
    number: o.number,
    source: o.source,
    channel: o.channel,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    paymentMethod: o.paymentMethod,
    deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString() : null,
    deliverySlot: o.deliverySlot,
    shipName: o.shipName,
    shipPhone: o.shipPhone,
    shipAddress: o.shipAddress,
    shipPincode: o.shipPincode,
    notes: o.notes,
    subtotal: n(o.subtotal),
    autoDiscountLabel: o.autoDiscountLabel,
    autoDiscount: n(o.autoDiscount),
    couponCode: o.couponCode,
    couponDiscount: n(o.couponDiscount),
    deliveryCharge: n(o.deliveryCharge),
    taxable: n(o.taxable),
    cgst: n(o.cgst),
    sgst: n(o.sgst),
    igst: n(o.igst),
    total: n(o.total),
    interState: o.interState,
    vehicleNo: o.vehicleNo,
    driverName: o.driverName,
    driverPhone: o.driverPhone,
    cancelReason: o.cancelReason,
    items: o.items.map((i) => ({ id: i.id, productId: i.productId, name: i.name, unit: i.unit, qty: n(i.qty), rate: n(i.rate), discount: n(i.discount), hsn: i.hsn, category: i.product?.category ?? null })),
    events: o.events.map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt.toISOString() })),
    customer: { ...o.customer, creditLimit: n(o.customer.creditLimit) },
    invoice: o.invoice ? { id: o.invoice.id, number: o.invoice.number, status: o.invoice.status, total: n(o.invoice.total), amountPaid: n(o.invoice.amountPaid) } : null,
  };
}

/** Web store orders waiting for confirmation — the Orders badge. */
export async function pendingOrderCount(): Promise<number> {
  await requireUser();
  return prisma.order.count({ where: { status: 'PENDING' } });
}

// ── Settings ───────────────────────────────────────────────────────────────

export type OrderSettings = { orderPrefix: string; nextOrderNo: number; invoiceTrigger: InvoiceTrigger; autoConfirmWebOrders: boolean };

export async function getOrderSettings(): Promise<OrderSettings> {
  const c = await getCompany();
  return { orderPrefix: c.orderPrefix, nextOrderNo: c.nextOrderNo, invoiceTrigger: c.invoiceTrigger, autoConfirmWebOrders: c.autoConfirmWebOrders };
}

const SettingsSchema = z.object({
  orderPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,8}$/, 'Use 1–8 letters or numbers.'),
  nextOrderNo: z.coerce.number().int().min(1, 'Start at 1 or more.').max(99_999_999),
  invoiceTrigger: z.enum(['ON_CONFIRM', 'ON_DISPATCH', 'MANUAL']),
  autoConfirmWebOrders: z.boolean(),
});

export async function updateOrderSettings(input: z.input<typeof SettingsSchema>): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const parsed = SettingsSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the settings.' };
    const company = await getCompany();
    const d = parsed.data;
    const clash = await prisma.order.findFirst({ where: { number: `${d.orderPrefix}-${d.nextOrderNo}` }, select: { id: true } });
    if (clash) return { error: `${d.orderPrefix}-${d.nextOrderNo} is already used. Pick a higher next number.` };
    await prisma.company.update({ where: { id: company.id }, data: d });
    await logActivity({ userId: user.id, action: 'company.orders', entityType: 'company', entityId: company.id, summary: 'Updated order settings' });
    revalidatePath('/settings/orders');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
