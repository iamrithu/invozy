'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { saveUploadedImage, deleteUploadedImage } from '@/lib/uploads';

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

/** Uploads any new image files in `newImages`, appends them to the URLs the
 * client says to keep (`images`), and caps the result at MAX_IMAGES. */
async function resolveImages(formData: FormData, companyId: string, keep: string[]) {
  const newFiles = formData.getAll('newImages').filter((f): f is File => f instanceof File && f.size > 0);
  const uploaded = await Promise.all(newFiles.map((f) => saveUploadedImage(f, companyId, 'products')));
  return [...keep, ...uploaded].slice(0, MAX_IMAGES);
}

export type ProductFormState = { error?: string; fieldErrors?: Record<string, string>; id?: string };

export async function listProducts(opts?: { search?: string; category?: string; activeOnly?: boolean }) {
  const company = await getCompany();
  return prisma.product.findMany({
    where: {
      companyId: company.id,
      ...(opts?.search ? { name: { contains: opts.search, mode: 'insensitive' } } : {}),
      ...(opts?.category && opts.category !== 'all' ? { category: opts.category } : {}),
      ...(opts?.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    include: { priceTiers: { orderBy: { sortOrder: 'asc' } } },
  });
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
  const company = await getCompany();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const where = {
    companyId: company.id,
    ...(opts?.search ? { name: { contains: opts.search, mode: 'insensitive' as const } } : {}),
    ...(opts?.category && opts.category !== 'all' ? { category: opts.category } : {}),
    ...(opts?.activeOnly ? { active: true } : {}),
  };
  const orderBy =
    opts?.sort === 'price-asc'
      ? [{ price: 'asc' as const }]
      : opts?.sort === 'price-desc'
        ? [{ price: 'desc' as const }]
        : [{ category: 'asc' as const }, { name: 'asc' as const }];

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
  const company = await getCompany();
  const rows = await prisma.product.findMany({
    where: { companyId: company.id },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
    take: 100,
  });
  return rows.map((r) => r.category).filter(Boolean);
}

export async function createProduct(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const parsed = ProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const tiersResult = parseTiers(formData);
  if ('error' in tiersResult) {
    return { error: tiersResult.error, fieldErrors: { tiers: tiersResult.error } };
  }
  const company = await getCompany();
  let images: string[];
  try {
    images = await resolveImages(formData, company.id, []);
  } catch (e: any) {
    return { error: e.message ?? 'Could not upload photo.' };
  }
  // Product.unit/price stay the "primary" pair (dashboard/reports/quick list
  // views keep reading them directly) — always mirrored from the first tier.
  const primary = tiersResult.tiers[0];
  const product = await prisma.$transaction(async (tx) => {
    return tx.product.create({
      data: {
        ...parsed.data,
        unit: primary.unit,
        price: primary.price,
        packQty: parsed.data.packQty ?? null,
        images,
        companyId: company.id,
        priceTiers: {
          create: tiersResult.tiers.map((t, i) => ({ unit: t.unit, price: t.price, approxQty: t.approxQty ?? null, sortOrder: i })),
        },
      },
    });
  });
  revalidatePath('/products');
  return { id: product.id };
}

export async function updateProduct(id: string, _prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const parsed = ProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
  }
  const tiersResult = parseTiers(formData);
  if ('error' in tiersResult) {
    return { error: tiersResult.error, fieldErrors: { tiers: tiersResult.error } };
  }
  const company = await getCompany();
  const existing = await prisma.product.findFirst({ where: { id, companyId: company.id } });
  if (!existing) {
    return { error: 'Product not found.' };
  }

  const keep = formData.getAll('images').filter((v): v is string => typeof v === 'string' && v.length > 0);
  const removed = existing.images.filter((url) => !keep.includes(url));
  await Promise.all(removed.map(deleteUploadedImage));
  let images: string[];
  try {
    images = await resolveImages(formData, company.id, keep);
  } catch (e: any) {
    return { error: e.message ?? 'Could not upload photo.' };
  }

  const primary = tiersResult.tiers[0];
  await prisma.$transaction(async (tx) => {
    // Replace-all rather than diffing tier identity across renames — the
    // simplest correct way to keep ProductPriceTier in sync with the form's
    // full tier list on every save.
    await tx.productPriceTier.deleteMany({ where: { productId: id } });
    await tx.product.update({
      where: { id },
      data: {
        ...parsed.data,
        unit: primary.unit,
        price: primary.price,
        packQty: parsed.data.packQty ?? null,
        images,
        priceTiers: {
          create: tiersResult.tiers.map((t, i) => ({ unit: t.unit, price: t.price, approxQty: t.approxQty ?? null, sortOrder: i })),
        },
      },
    });
  });
  revalidatePath('/products');
  return {};
}

/** Powers the invoice builder's "frequently ordered by this customer" shortcut. */
export async function frequentProductIdsForCustomer(customerId: string, limit = 4) {
  const items = await prisma.invoiceItem.findMany({
    where: { invoice: { customerId } },
    select: { productId: true, qty: true },
  });
  const counts = new Map<string, number>();
  for (const it of items) {
    if (!it.productId) continue; // ad-hoc/custom line items have no product to recommend
    counts.set(it.productId, (counts.get(it.productId) ?? 0) + Number(it.qty));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}

/** Surfaces a "you keep billing this by hand" nudge on the dashboard —
 * groups ad-hoc (productId-null) invoice line items by exact name and
 * returns the ones billed at least `threshold` times, so the user can add
 * them to the catalog in one click instead of re-typing them each time.
 * Known simplification: exact-string match (case-sensitive) on `name`. */
export async function getFrequentCustomItems(threshold = 3) {
  const company = await getCompany();
  const rows = await prisma.invoiceItem.groupBy({
    by: ['name'],
    where: { productId: null, invoice: { companyId: company.id } },
    _count: { name: true },
    _max: { unit: true, rate: true },
  });
  return rows
    .filter((r) => r._count.name >= threshold)
    .map((r) => ({ name: r.name, count: r._count.name, unit: r._max.unit ?? '', rate: Number(r._max.rate ?? 0) }))
    .sort((a, b) => b.count - a.count);
}

export async function toggleProductActive(id: string) {
  const company = await getCompany();
  const product = await prisma.product.findFirst({ where: { id, companyId: company.id } });
  if (!product) throw new Error('Product not found.');
  await prisma.product.update({ where: { id }, data: { active: !product.active } });
  revalidatePath('/products');
}

export async function deleteProduct(id: string) {
  const company = await getCompany();
  const product = await prisma.product.findFirst({ where: { id, companyId: company.id } });
  if (!product) throw new Error('Product not found.');

  // No cascade from InvoiceItem here on purpose: an invoice that already
  // billed this product keeps its line intact (name/rate are snapshotted
  // onto InvoiceItem — see schema.prisma). Deleting the catalog entry must
  // never rewrite history on a sent invoice.
  const usedOnInvoice = await prisma.invoiceItem.findFirst({ where: { productId: id } });
  if (usedOnInvoice) {
    throw new Error('This product has been billed on at least one invoice and can\u2019t be deleted. Hide it instead.');
  }
  await prisma.product.delete({ where: { id } });
  await Promise.all(product.images.map(deleteUploadedImage));
  revalidatePath('/products');
}
