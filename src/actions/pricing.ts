'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { istDayRangeUtc } from '@/lib/dates';
import { customerDisplayName } from '@/lib/customer';
import { fmtInr, formatUnit } from '@/lib/gst';

// Customer special prices (CustomerPrice) and "Buy N, get M free" offers
// (Scheme). Both are keyed by product + unit, where the unit is always
// stored with the exact spelling of one of the product's price tiers, so the
// invoice builder can match them against a line's unit directly.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function sameUnit(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The product's own spelling of `unit` (one of its tiers, or its main
 * unit), or null when the product isn't sold by that unit at all. */
function productUnit(product: { unit: string; priceTiers: { unit: string }[] }, unit: string): string | null {
  return product.priceTiers.find((t) => sameUnit(t.unit, unit))?.unit ?? (sameUnit(product.unit, unit) ? product.unit : null);
}

/** A stored validity bound back to the `YYYY-MM-DD` IST calendar date the
 * form's date input shows. */
function toIstDate(d: Date | null): string | null {
  return d ? new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10) : null;
}

function firstIssue(err: z.ZodError) {
  return err.issues[0]?.message ?? 'Check the details and try again.';
}

// ---------------------------------------------------------------------------
// Customer special prices

export type CustomerPriceRow = {
  id: string;
  productId: string;
  productName: string;
  productActive: boolean;
  unit: string;
  price: number;
  /** The catalog price for the same unit, for "₹340 instead of ₹360". */
  catalogPrice: number | null;
};

/** One customer's special prices, for the "Special prices" section of the
 * customer detail sheet. */
export async function listCustomerPrices(customerId: string): Promise<CustomerPriceRow[]> {
  await requireUser();
  const rows = await prisma.customerPrice.findMany({
    where: { customerId },
    include: { product: { select: { name: true, active: true, priceTiers: { select: { unit: true, price: true } } } } },
    orderBy: [{ product: { name: 'asc' } }, { unit: 'asc' }],
  });
  return rows.map((r) => {
    const tier = r.product.priceTiers.find((t) => sameUnit(t.unit, r.unit));
    return {
      id: r.id,
      productId: r.productId,
      productName: r.product.name,
      productActive: r.product.active,
      unit: r.unit,
      price: Number(r.price),
      catalogPrice: tier ? Number(tier.price) : null,
    };
  });
}

/** Every special price for one customer, flat — what the invoice builder
 * uses in place of the catalog rate once this customer is on the bill. */
export async function getCustomerPriceMap(customerId: string): Promise<{ productId: string; unit: string; price: number }[]> {
  await requireUser();
  const rows = await prisma.customerPrice.findMany({ where: { customerId }, select: { productId: true, unit: true, price: true } });
  return rows.map((r) => ({ productId: r.productId, unit: r.unit, price: Number(r.price) }));
}

const SetPriceSchema = z.object({
  customerId: z.string().min(1, 'Pick a customer.'),
  productId: z.string().min(1, 'Pick a product.'),
  unit: z.string().trim().min(1, 'Pick a unit.'),
  price: z.coerce.number({ invalid_type_error: 'Enter a price.' }).min(0, 'The price must be 0 or more.'),
});

/** Adds or replaces this customer's price for one product + unit (one row
 * per customer/product/unit — the unique key). */
export async function setCustomerPrice(input: { customerId: string; productId: string; unit: string; price: number }): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = SetPriceSchema.safeParse(input);
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const { customerId, productId, price } = parsed.data;
    const [customer, product] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, shopName: true } }),
      prisma.product.findUnique({ where: { id: productId }, select: { name: true, unit: true, priceTiers: { select: { unit: true } } } }),
    ]);
    if (!customer) return { error: 'Customer not found. It may have been deleted.' };
    if (!product) return { error: 'Product not found. It may have been deleted.' };
    const unit = productUnit(product, parsed.data.unit);
    if (!unit) return { error: `${product.name} isn't sold by ${formatUnit(parsed.data.unit)}. Pick one of its units.` };

    const row = await prisma.customerPrice.upsert({
      where: { customerId_productId_unit: { customerId, productId, unit } },
      create: { customerId, productId, unit, price },
      update: { price },
      select: { id: true },
    });
    await logActivity({
      userId: user.id,
      action: 'customer.price.set',
      entityType: 'customer',
      entityId: customerId,
      summary: `Special price for ${customerDisplayName(customer)}: ${product.name} at ${fmtInr(price)}/${formatUnit(unit)}`,
    });
    revalidatePath('/customers');
    return { id: row.id };
  } catch (e) {
    return toActionError(e);
  }
}

/** Owner-only, like every delete. Already-removed rows count as done. */
export async function deleteCustomerPrice(id: string): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const row = await prisma.customerPrice.findUnique({
      where: { id },
      select: { customerId: true, unit: true, product: { select: { name: true } }, customer: { select: { name: true, shopName: true } } },
    });
    if (!row) return {};
    await prisma.customerPrice.deleteMany({ where: { id } });
    await logActivity({
      userId: user.id,
      action: 'customer.price.delete',
      entityType: 'customer',
      entityId: row.customerId,
      summary: `Removed ${customerDisplayName(row.customer)}'s special price for ${row.product.name} (${formatUnit(row.unit)})`,
    });
    revalidatePath('/customers');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

// ---------------------------------------------------------------------------
// Offers / schemes — "Buy N, get M free"

export type SchemeRow = {
  id: string;
  productId: string;
  name: string | null;
  unit: string;
  buyQty: number;
  freeQty: number;
  active: boolean;
  /** Inclusive IST calendar dates (`YYYY-MM-DD`), null = open-ended. */
  validFrom: string | null;
  validTo: string | null;
};

/** One product's offers, newest first, for the product detail sheet. */
export async function listSchemes(productId: string): Promise<SchemeRow[]> {
  await requireUser();
  const rows = await prisma.scheme.findMany({ where: { productId }, orderBy: { createdAt: 'desc' } });
  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    name: r.name,
    unit: r.unit,
    buyQty: Number(r.buyQty),
    freeQty: Number(r.freeQty),
    active: r.active,
    validFrom: toIstDate(r.validFrom),
    validTo: toIstDate(r.validTo),
  }));
}

/** Every offer that applies right now — active, and today falls inside its
 * optional validity window. The invoice builder suggests a free line (rate
 * 0) once a line's quantity reaches `buyQty`. */
export async function listActiveSchemes(): Promise<{ id: string; productId: string; unit: string; buyQty: number; freeQty: number; name: string | null }[]> {
  await requireUser();
  const now = new Date();
  const rows = await prisma.scheme.findMany({
    where: {
      active: true,
      AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }],
    },
    select: { id: true, productId: true, unit: true, buyQty: true, freeQty: true, name: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ id: r.id, productId: r.productId, unit: r.unit, buyQty: Number(r.buyQty), freeQty: Number(r.freeQty), name: r.name }));
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.')
  .optional()
  .nullable()
  .or(z.literal(''));

const SchemeSchema = z.object({
  id: z.string().optional().nullable(),
  productId: z.string().min(1, 'Pick a product.'),
  name: z.string().trim().max(80, 'Keep the offer name under 80 characters.').optional().nullable(),
  unit: z.string().trim().min(1, 'Pick a unit.'),
  buyQty: z.coerce.number({ invalid_type_error: 'Enter how many to buy.' }).positive('"Buy" must be more than 0.'),
  freeQty: z.coerce.number({ invalid_type_error: 'Enter how many are free.' }).positive('"Free" must be more than 0.'),
  active: z.boolean().optional(),
  validFrom: isoDate,
  validTo: isoDate,
});

export type SchemeInput = z.input<typeof SchemeSchema>;

/** Creates an offer, or updates one when `id` is given. Validity dates are
 * whole IST days: `validFrom` starts at that day's midnight, `validTo` ends
 * at the last instant of its day. */
export async function saveScheme(input: SchemeInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = SchemeSchema.safeParse(input);
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const d = parsed.data;
    if (d.validFrom && d.validTo && d.validTo < d.validFrom) return { error: 'The end date is before the start date.' };

    const [product, existing] = await Promise.all([
      prisma.product.findUnique({ where: { id: d.productId }, select: { name: true, unit: true, priceTiers: { select: { unit: true } } } }),
      d.id ? prisma.scheme.findUnique({ where: { id: d.id }, select: { productId: true, unit: true } }) : null,
    ]);
    if (!product) return { error: 'Product not found. It may have been deleted.' };
    if (d.id && (!existing || existing.productId !== d.productId)) return { error: 'This offer no longer exists. Refresh and try again.' };
    // An unchanged unit stays valid even if the product's tiers were renamed
    // since — so switching an old offer off never fails on it.
    const unit = existing && existing.unit === d.unit ? existing.unit : productUnit(product, d.unit);
    if (!unit) return { error: `${product.name} isn't sold by ${formatUnit(d.unit)}. Pick one of its units.` };

    const data = {
      name: d.name || null,
      unit,
      buyQty: d.buyQty,
      freeQty: d.freeQty,
      active: d.active ?? true,
      validFrom: d.validFrom ? istDayRangeUtc(d.validFrom).gte : null,
      validTo: d.validTo ? new Date(istDayRangeUtc(d.validTo).lt.getTime() - 1) : null,
    };
    const row = d.id
      ? await prisma.scheme.update({ where: { id: d.id }, data, select: { id: true } })
      : await prisma.scheme.create({ data: { ...data, productId: d.productId }, select: { id: true } });
    const u = formatUnit(unit);
    await logActivity({
      userId: user.id,
      action: d.id ? 'product.offer.update' : 'product.offer.create',
      entityType: 'product',
      entityId: d.productId,
      summary: `${d.id ? 'Updated' : 'Added'} offer on ${product.name}: buy ${d.buyQty} ${u}, get ${d.freeQty} ${u} free${data.active ? '' : ' (off)'}`,
    });
    revalidatePath('/products');
    return { id: row.id };
  } catch (e) {
    return toActionError(e);
  }
}

/** Owner-only, like every delete. Already-removed offers count as done. */
export async function deleteScheme(id: string): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const row = await prisma.scheme.findUnique({ where: { id }, select: { productId: true, buyQty: true, freeQty: true, unit: true, product: { select: { name: true } } } });
    if (!row) return {};
    await prisma.scheme.deleteMany({ where: { id } });
    const u = formatUnit(row.unit);
    await logActivity({
      userId: user.id,
      action: 'product.offer.delete',
      entityType: 'product',
      entityId: row.productId,
      summary: `Removed offer on ${row.product.name}: buy ${Number(row.buyQty)} ${u}, get ${Number(row.freeQty)} ${u} free`,
    });
    revalidatePath('/products');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
