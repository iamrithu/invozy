'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireUser } from '@/lib/session';
import { saveUploadedImage, deleteUploadedImage } from '@/lib/uploads';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { applyMovement } from '@/lib/stock';
import { needsPackSize } from '@/lib/stock-units';

const MAX_IMAGES = 6;

const ProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1),
  unit: z.string().min(1),
  price: z.coerce.number().min(0),
  packQty: z.coerce.number().int().min(0).optional().nullable(),
  desc: z.string().optional().nullable(),
  hsn: z.string().optional().nullable(),
  altUnit: z.string().optional().nullable(),
  altQtyPerUnit: z.coerce.number().min(0).optional().nullable(),
});

/** Additional unit+price pricing options for the same product (e.g. sold as
 * a Box at one price with a minimum order quantity, and as a loose Piece at
 * a plain price) — see ProductPriceTier in prisma/schema.prisma. Sent as a
 * JSON-encoded `tiers` field rather than through the main
 * `Object.fromEntries(formData)` parse above, same reason `images`/
 * `newImages` are handled separately: FormData can't carry an array of
 * objects, and `Object.fromEntries` would collapse repeated keys anyway. */
const PriceTierSchema = z
  .array(
    z.object({
      unit: z.string().min(1),
      price: z.coerce.number().min(0),
      // Informational only (e.g. "1 Box ≈ 40 Piece") — never a purchase
      // minimum. See ProductPriceTier.approxQty in schema.prisma.
      approxQty: z.coerce.number().min(0).optional().nullable(),
    })
  )
  .min(1, 'At least one pricing option is required.');

function parseTiers(formData: FormData): { tiers: z.infer<typeof PriceTierSchema> } | { error: string } {
  const raw = formData.get('tiers');
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'At least one pricing option is required.' };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { error: 'Invalid pricing data.' };
  }
  const result = PriceTierSchema.safeParse(parsedJson);
  if (!result.success) return { error: 'Check the pricing rows — each needs a unit and a price.' };
  return { tiers: result.data };
}

/** Uploads the `newImages` files (at most `room` of them). All-or-nothing:
 * if any upload fails, the ones that did succeed are deleted again before
 * the error is rethrown, so a failed save never leaves orphaned files. */
async function uploadNewImages(formData: FormData, room: number): Promise<string[]> {
  const files = formData
    .getAll('newImages')
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, Math.max(room, 0));
  const results = await Promise.allSettled(files.map((f) => saveUploadedImage(f, 'products')));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  const uploaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (failed) {
    await Promise.all(uploaded.map(deleteUploadedImage));
    throw failed.reason instanceof Error ? failed.reason : new Error('Could not upload photo.');
  }
  return uploaded;
}

type StockFields = { trackStock: boolean; openingStock: number | null; lowStockAt: number | null };

/** The product form's Stock section: the "Track stock" switch, "Opening
 * stock" and "Low-stock alert at" — both counted in the main unit, and both
 * optional (blank = not set). */
function parseStock(formData: FormData): StockFields | { error: string; field: string } {
  const num = (key: string) => {
    const raw = formData.get(key);
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };
  const openingStock = num('openingStock');
  const lowStockAt = num('lowStockAt');
  if (openingStock != null && !(openingStock >= 0)) return { error: 'Opening stock must be 0 or more.', field: 'openingStock' };
  if (lowStockAt != null && !(lowStockAt >= 0)) return { error: 'The low-stock alert must be 0 or more.', field: 'lowStockAt' };
  const track = formData.get('trackStock');
  return { trackStock: track === 'on' || track === 'true', openingStock, lowStockAt };
}

function sameUnit(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Stock is counted in the main unit, so a Piece sale of a Box product
 * needs "pieces in 1 Box" to convert — see needsPackSize. */
function packSizeMessage(mainUnit: string) {
  return `Set how many pieces are in 1 ${mainUnit} in the first pricing option — stock is counted in ${mainUnit}, so smaller sales can't be converted without it.`;
}

export type ProductFormState = { error?: string; fieldErrors?: Record<string, string>; id?: string };

export async function listProducts(opts?: { search?: string; category?: string; activeOnly?: boolean }) {
  await requireUser();
  return prisma.product.findMany({
    where: {
      ...(opts?.search ? { name: { contains: opts.search, mode: 'insensitive' } } : {}),
      ...(opts?.category && opts.category !== 'all' ? { category: opts.category } : {}),
      ...(opts?.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    include: { priceTiers: { orderBy: { sortOrder: 'asc' } } },
  });
}

/** Every live product with its price tiers, trimmed to what a picker needs
 * and JSON-normalized (Decimal → string) so a client-side queryFn can call
 * it directly — used by the customer "Special prices" picker. */
export async function listProductOptions() {
  await requireUser();
  const rows = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, category: true, unit: true, price: true, priceTiers: { select: { unit: true, price: true, approxQty: true }, orderBy: { sortOrder: 'asc' } } },
  });
  return JSON.parse(JSON.stringify(rows)) as {
    id: string;
    name: string;
    category: string;
    unit: string;
    price: string;
    priceTiers: { unit: string; price: string; approxQty: string | null }[];
  }[];
}

export type ProductSort = 'name' | 'price-asc' | 'price-desc';

/** DB-level search/filter/sort/pagination for the Products list page — every
 * keystroke and page click re-queries Postgres instead of filtering a
 * client-held array, so the page stays cheap regardless of catalog size. */
export async function listProductsPage(opts?: {
  search?: string;
  category?: string;
  activeOnly?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}) {
  await requireUser();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const where = {
    ...(opts?.search ? { name: { contains: opts.search, mode: 'insensitive' as const } } : {}),
    ...(opts?.category && opts.category !== 'all' ? { category: opts.category } : {}),
    ...(opts?.activeOnly ? { active: true } : {}),
  };
  const orderBy =
    opts?.sort === 'price-asc'
      ? [{ price: 'asc' as const }]
      : opts?.sort === 'price-desc'
        ? [{ price: 'desc' as const }]
        : [{ category: 'asc' as const }, { name: 'asc' as const }, { id: 'asc' as const }];

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { priceTiers: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.product.count({ where }),
  ]);
  return { items: JSON.parse(JSON.stringify(items)), total };
}

/** Powers the category combobox (create/edit forms) and the list page's
 * filter chips — categories are just whatever string a product was tagged
 * with (no separate category table to manage), grouped here via a plain
 * DISTINCT query so the same spelling gets reused instead of drifting
 * ("Milk" vs "milk" vs "Milks") across a growing catalog. */
export async function getProductCategories() {
  await requireUser();
  const rows = await prisma.product.findMany({
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
    take: 100,
  });
  return rows.map((r) => r.category).filter(Boolean);
}

/** Creates the product with its pricing options, photos and — when the
 * form's "Track stock" switch is on — its stock settings. Opening stock is
 * posted as an OPENING movement inside the same transaction, so the product
 * never exists with a balance its ledger doesn't explain. Blank opening
 * stock with tracking on starts at 0; tracking off leaves the product
 * untracked (it can be switched on later from Inventory). */
export async function createProduct(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  let uploaded: string[] = [];
  try {
    const parsed = ProductSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
    }
    const tiersResult = parseTiers(formData);
    if ('error' in tiersResult) {
      return { error: tiersResult.error, fieldErrors: { tiers: tiersResult.error } };
    }
    const stock = parseStock(formData);
    if ('error' in stock) return { error: stock.error, fieldErrors: { [stock.field]: stock.error } };
    // Product.unit/price stay the "primary" pair (dashboard/reports/quick list
    // views keep reading them directly) — always mirrored from the first tier.
    const primary = tiersResult.tiers[0];
    if (stock.trackStock && needsPackSize({ unit: primary.unit, packQty: parsed.data.packQty, priceTiers: tiersResult.tiers })) {
      const msg = packSizeMessage(primary.unit);
      return { error: msg, fieldErrors: { tiers: msg } };
    }
    const user = await requireUser();
    uploaded = await uploadNewImages(formData, MAX_IMAGES);
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...parsed.data,
          unit: primary.unit,
          price: primary.price,
          packQty: parsed.data.packQty ?? null,
          images: uploaded,
          trackStock: stock.trackStock,
          lowStockAt: stock.trackStock ? stock.lowStockAt : null,
          priceTiers: {
            create: tiersResult.tiers.map((t, i) => ({ unit: t.unit, price: t.price, approxQty: t.approxQty ?? null, sortOrder: i })),
          },
        },
        include: { priceTiers: { select: { unit: true, approxQty: true } } },
      });
      if (stock.trackStock && stock.openingStock && stock.openingStock > 0) {
        await applyMovement(tx, created, stock.openingStock, { type: 'OPENING', note: 'Opening stock', userId: user.id }, false);
      }
      return created;
    });
    uploaded = []; // saved — no longer ours to clean up
    await logActivity({ userId: user.id, action: 'product.create', entityType: 'product', entityId: product.id, summary: `Added product ${product.name}` });
    revalidatePath('/products');
    return { id: product.id };
  } catch (e) {
    await Promise.all(uploaded.map(deleteUploadedImage));
    return toActionError(e);
  }
}

/** Saves the edit form. Stock tracking itself is switched on/off from
 * Inventory (where every change is recorded), so only the low-stock alert
 * is editable here — and a tracked product can't change its main unit or
 * lose its pack size, since both would silently re-mean its stock count. */
export async function updateProduct(id: string, _prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  let uploaded: string[] = [];
  try {
    const parsed = ProductSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
    }
    const tiersResult = parseTiers(formData);
    if ('error' in tiersResult) {
      return { error: tiersResult.error, fieldErrors: { tiers: tiersResult.error } };
    }
    const stock = parseStock(formData);
    if ('error' in stock) return { error: stock.error, fieldErrors: { [stock.field]: stock.error } };
    const user = await requireUser();
    const existing = await prisma.product.findUnique({ where: { id }, select: { images: true, trackStock: true, unit: true } });
    if (!existing) {
      return { error: 'Product not found. It may have been deleted.' };
    }

    const primary = tiersResult.tiers[0];
    if (existing.trackStock) {
      if (!sameUnit(primary.unit, existing.unit)) {
        const msg = `Stock for this product is counted in ${existing.unit}. Keep ${existing.unit} as the first pricing option, or stop tracking its stock from Inventory first.`;
        return { error: msg, fieldErrors: { tiers: msg } };
      }
      if (needsPackSize({ unit: primary.unit, packQty: parsed.data.packQty, priceTiers: tiersResult.tiers })) {
        const msg = packSizeMessage(primary.unit);
        return { error: msg, fieldErrors: { tiers: msg } };
      }
    }

    // Only URLs already on this product can be kept — never an arbitrary URL
    // a request made up.
    const keep = formData.getAll('images').filter((v): v is string => typeof v === 'string' && existing.images.includes(v));
    const removed = existing.images.filter((url) => !keep.includes(url));
    uploaded = await uploadNewImages(formData, MAX_IMAGES - keep.length);
    const images = [...keep, ...uploaded];

    const product = await prisma.$transaction(async (tx) => {
      // Replace-all rather than diffing tier identity across renames — the
      // simplest correct way to keep ProductPriceTier in sync with the form's
      // full tier list on every save.
      await tx.productPriceTier.deleteMany({ where: { productId: id } });
      return tx.product.update({
        where: { id },
        data: {
          ...parsed.data,
          unit: primary.unit,
          price: primary.price,
          packQty: parsed.data.packQty ?? null,
          images,
          ...(formData.has('lowStockAt') ? { lowStockAt: stock.lowStockAt } : {}),
          priceTiers: {
            create: tiersResult.tiers.map((t, i) => ({ unit: t.unit, price: t.price, approxQty: t.approxQty ?? null, sortOrder: i })),
          },
        },
        select: { name: true },
      });
    });
    uploaded = [];
    // Dropped photos are deleted only now that the new list is saved — doing
    // it first lost them whenever the upload or the save failed.
    await Promise.all(removed.map(deleteUploadedImage));
    await logActivity({ userId: user.id, action: 'product.update', entityType: 'product', entityId: id, summary: `Updated product ${product.name}` });
    revalidatePath('/products');
    return { id };
  } catch (e) {
    await Promise.all(uploaded.map(deleteUploadedImage));
    return toActionError(e);
  }
}

/** Powers the invoice builder's "frequently ordered by this customer" shortcut. */
export async function frequentProductIdsForCustomer(customerId: string, limit = 4) {
  await requireUser();
  const rows = await prisma.invoiceItem.groupBy({
    by: ['productId'],
    // Ad-hoc/custom line items have no product to recommend.
    where: { productId: { not: null }, invoice: { customerId } },
    _sum: { qty: true },
    orderBy: { _sum: { qty: 'desc' } },
    take: limit,
  });
  return rows.map((r) => r.productId!);
}

/** Surfaces a "you keep billing this by hand" nudge on the dashboard —
 * groups ad-hoc (productId-null) invoice line items by exact name and
 * returns the ones billed at least `threshold` times, so the user can add
 * them to the catalog in one click instead of re-typing them each time.
 * Known simplification: exact-string match (case-sensitive) on `name`. */
export async function getFrequentCustomItems(threshold = 3) {
  await requireUser();
  const rows = await prisma.invoiceItem.groupBy({
    by: ['name'],
    where: { productId: null },
    _count: { name: true },
    _max: { unit: true, rate: true },
    having: { name: { _count: { gte: threshold } } },
  });
  return rows
    .map((r) => ({ name: r.name, count: r._count.name, unit: r._max.unit ?? '', rate: Number(r._max.rate ?? 0) }))
    .sort((a, b) => b.count - a.count);
}

/** Live/Hidden — a hidden product stays on old invoices but drops out of
 * the invoice builder. Pass `active` to set it explicitly (safe against a
 * double click); omit it to flip. */
export async function toggleProductActive(id: string, active?: boolean): Promise<ActionResult<{ active: boolean }>> {
  try {
    const user = await requireUser();
    const product = await prisma.product.findUnique({ where: { id }, select: { active: true, name: true } });
    if (!product) return { error: 'Product not found. It may have been deleted.' };
    const next = active ?? !product.active;
    if (next !== product.active) {
      await prisma.product.update({ where: { id }, data: { active: next } });
      await logActivity({ userId: user.id, action: next ? 'product.show' : 'product.hide', entityType: 'product', entityId: id, summary: `${next ? 'Made' : 'Hid'} product ${product.name}${next ? ' live' : ''}` });
    }
    revalidatePath('/products');
    return { active: next };
  } catch (e) {
    return toActionError(e);
  }
}

/** Owner-only, and always allowed: invoice, purchase and credit-note lines
 * keep their own snapshot of the name, unit, rate and HSN, and their
 * productId is set to NULL by the database (ON DELETE SET NULL), so old
 * documents print exactly as before. The product's price tiers, stock
 * history, customer special prices and offers go with it (cascade). Photos
 * are deleted only after the delete has committed. */
export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const product = await prisma.product.findUnique({ where: { id }, select: { name: true, images: true } });
    if (!product) return { error: 'Product not found. It may already have been deleted.' };
    await prisma.$transaction(async (tx) => {
      await tx.product.delete({ where: { id } });
    });
    await Promise.all(product.images.map(deleteUploadedImage));
    await logActivity({ userId: user.id, action: 'product.delete', entityType: 'product', entityId: id, summary: `Deleted product ${product.name}` });
    revalidatePath('/products');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
