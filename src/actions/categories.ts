'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { CategoryStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireUser } from '@/lib/session';
import { saveUploadedImage, deleteUploadedImage } from '@/lib/uploads';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { freeCategorySlug as freeSlug } from '@/lib/categories';

// Catalog › Categories. A category's `name` is also copied onto each of its
// products (Product.category), which reports, exports and the invoice
// builder group by — so a rename updates both in one transaction.

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  parentName: string | null;
  status: CategoryStatus;
  showOnStore: boolean;
  sortOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
  deletedAt: string | null;
  productCount: number;
};

export type CategoryCounts = { all: number; active: number; disabled: number; trash: number };

function toRow(c: Prisma.CategoryGetPayload<{ include: { parent: { select: { name: true } }; _count: { select: { products: true } } } }>): CategoryRow {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    imageUrl: c.imageUrl,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
    status: c.status,
    showOnStore: c.showOnStore,
    sortOrder: c.sortOrder,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    productCount: c._count.products,
  };
}

/** Every category for the Categories screen (Trash included), in store
 * order, with product counts. */
export async function listCategories(): Promise<{ rows: CategoryRow[]; counts: CategoryCounts }> {
  await requireUser();
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { parent: { select: { name: true } }, _count: { select: { products: true } } },
  });
  const mapped = rows.map(toRow);
  const live = mapped.filter((c) => !c.deletedAt);
  return {
    rows: mapped,
    counts: {
      all: live.length,
      active: live.filter((c) => c.status === 'ACTIVE').length,
      disabled: live.filter((c) => c.status === 'DISABLED').length,
      trash: mapped.length - live.length,
    },
  };
}

/** Active categories for pickers (product form, coupons), in store order. */
export async function listCategoryOptions(): Promise<{ id: string; name: string }[]> {
  await requireUser();
  return prisma.category.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
}

const CategorySchema = z.object({
  name: z.string().trim().min(1, 'Give the category a name.').max(60, 'Keep the name under 60 characters.'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(60, 'Keep the slug under 60 characters.')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes.')
    .optional()
    .or(z.literal('')),
  description: z.string().trim().max(500).optional().nullable(),
  parentId: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
  showOnStore: z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean()),
  seoTitle: z.string().trim().max(70).optional().nullable(),
  seoDescription: z.string().trim().max(160).optional().nullable(),
});

export type CategoryFormState = { error?: string; fieldErrors?: Record<string, string>; id?: string };

const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** A free slug for `base` in this company. Trash counts: its slugs stay
 * reserved so a restore never clashes. */

async function checkName(name: string, exceptId?: string): Promise<string | null> {
  const clash = await prisma.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { deletedAt: true },
  });
  if (!clash) return null;
  return clash.deletedAt ? `A category called ${name} is in Trash. Restore it instead.` : `There is already a category called ${name}.`;
}

async function checkParent(parentId: string | null, selfId?: string): Promise<string | null> {
  if (!parentId) return null;
  if (parentId === selfId) return 'A category can’t be inside itself.';
  const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { parentId: true, deletedAt: true } });
  if (!parent || parent.deletedAt) return 'That parent category no longer exists.';
  if (parent.parentId) return 'Pick a top-level category as the parent. Sub-categories go one level deep.';
  if (selfId) {
    const hasChildren = await prisma.category.count({ where: { parentId: selfId, deletedAt: null } });
    if (hasChildren) return 'This category has sub-categories of its own, so it has to stay top level.';
  }
  return null;
}

function imageFrom(formData: FormData): File | null {
  const f = formData.get('image');
  return f instanceof File && f.size > 0 ? f : null;
}

export async function createCategory(_prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  let uploaded: string | null = null;
  try {
    const user = await requireUser();
    const parsed = CategorySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
    const d = parsed.data;
    const nameError = await checkName(d.name);
    if (nameError) return { error: nameError, fieldErrors: { name: nameError } };
    const parentId = blankToNull(d.parentId);
    const parentError = await checkParent(parentId);
    if (parentError) return { error: parentError, fieldErrors: { parentId: parentError } };
    if (d.slug) {
      const taken = await prisma.category.findFirst({ where: { slug: d.slug }, select: { name: true, deletedAt: true } });
      if (taken) {
        const msg = `/${d.slug} is used by ${taken.name}${taken.deletedAt ? ' (in Trash)' : ''}.`;
        return { error: msg, fieldErrors: { slug: msg } };
      }
    }
    const image = imageFrom(formData);
    if (image) uploaded = await saveUploadedImage(image, 'categories');
    const created = await prisma.$transaction(async (tx) => {
      const last = await tx.category.aggregate({ _max: { sortOrder: true } });
      return tx.category.create({
        data: {
          name: d.name,
          slug: d.slug || (await freeSlug(tx, d.name)),
          description: blankToNull(d.description),
          parentId,
          status: d.status,
          showOnStore: d.showOnStore,
          seoTitle: blankToNull(d.seoTitle),
          seoDescription: blankToNull(d.seoDescription),
          imageUrl: uploaded,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
      });
    });
    uploaded = null;
    await logActivity({ userId: user.id, action: 'category.create', entityType: 'category', entityId: created.id, summary: `Added category ${created.name}` });
    revalidatePath('/categories');
    revalidatePath('/products');
    return { id: created.id };
  } catch (e) {
    if (uploaded) await deleteUploadedImage(uploaded);
    return toActionError(e);
  }
}

export async function updateCategory(id: string, _prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  let uploaded: string | null = null;
  try {
    const user = await requireUser();
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return { error: 'That category no longer exists. It may have been deleted.' };
    const parsed = CategorySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
    const d = parsed.data;
    const nameError = await checkName(d.name, id);
    if (nameError) return { error: nameError, fieldErrors: { name: nameError } };
    const parentId = blankToNull(d.parentId);
    const parentError = await checkParent(parentId, id);
    if (parentError) return { error: parentError, fieldErrors: { parentId: parentError } };
    const slug = d.slug || existing.slug;
    if (slug !== existing.slug) {
      const taken = await prisma.category.findFirst({ where: { slug, id: { not: id } }, select: { name: true, deletedAt: true } });
      if (taken) {
        const msg = `/${slug} is used by ${taken.name}${taken.deletedAt ? ' (in Trash)' : ''}.`;
        return { error: msg, fieldErrors: { slug: msg } };
      }
    }
    const image = imageFrom(formData);
    const removeImage = formData.get('removeImage') === 'true';
    if (image) uploaded = await saveUploadedImage(image, 'categories');
    const imageUrl = uploaded ?? (removeImage ? null : existing.imageUrl);

    await prisma.$transaction(async (tx) => {
      await tx.category.update({
        where: { id },
        data: {
          name: d.name,
          slug,
          description: blankToNull(d.description),
          parentId,
          status: d.status,
          showOnStore: d.showOnStore,
          seoTitle: blankToNull(d.seoTitle),
          seoDescription: blankToNull(d.seoDescription),
          imageUrl,
        },
      });
      // Products carry the name too (see Product.category).
      if (d.name !== existing.name) await tx.product.updateMany({ where: { categoryId: id }, data: { category: d.name } });
    });
    uploaded = null;
    if (existing.imageUrl && existing.imageUrl !== imageUrl) await deleteUploadedImage(existing.imageUrl);
    await logActivity({ userId: user.id, action: 'category.update', entityType: 'category', entityId: id, summary: `Updated category ${d.name}` });
    revalidatePath('/categories');
    revalidatePath('/products');
    return { id };
  } catch (e) {
    if (uploaded) await deleteUploadedImage(uploaded);
    return toActionError(e);
  }
}

export async function setCategoryStatus(id: string, status: CategoryStatus): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const c = await prisma.category.update({ where: { id }, data: { status }, select: { name: true } });
    await logActivity({ userId: user.id, action: 'category.status', entityType: 'category', entityId: id, summary: `${status === 'ACTIVE' ? 'Enabled' : 'Disabled'} category ${c.name}` });
    revalidatePath('/categories');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

export async function setCategoryOnStore(id: string, showOnStore: boolean): Promise<ActionResult> {
  try {
    await requireUser();
    await prisma.category.update({ where: { id }, data: { showOnStore } });
    revalidatePath('/categories');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

/** Saves the web store order: `ids` top to bottom. */
export async function reorderCategories(ids: string[]): Promise<ActionResult> {
  try {
    await requireUser();
    const unique = Array.from(new Set(ids)).slice(0, 500);
    await prisma.$transaction(unique.map((id, i) => prisma.category.update({ where: { id }, data: { sortOrder: i + 1 } })));
    revalidatePath('/categories');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

/** Moves a category to Trash. Its products must go somewhere first:
 * `moveTo` names the active category that takes them. Sub-categories become
 * top level. */
export async function trashCategory(id: string, moveTo?: string | null): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!c || c.deletedAt) return { error: 'That category is already gone.' };
    let target: { id: string; name: string } | null = null;
    if (c._count.products > 0) {
      if (!moveTo) return { error: `Choose where ${c.name}’s ${c._count.products} product${c._count.products === 1 ? '' : 's'} should go.` };
      if (moveTo === id) return { error: 'Pick a different category for the products.' };
      target = await prisma.category.findFirst({ where: { id: moveTo, deletedAt: null, status: 'ACTIVE' }, select: { id: true, name: true } });
      if (!target) return { error: 'Pick an active category for the products.' };
    }
    await prisma.$transaction(async (tx) => {
      if (target) await tx.product.updateMany({ where: { categoryId: id }, data: { categoryId: target.id, category: target.name } });
      await tx.category.updateMany({ where: { parentId: id }, data: { parentId: null } });
      await tx.category.update({ where: { id }, data: { deletedAt: new Date(), parentId: null } });
    });
    await logActivity({
      userId: user.id,
      action: 'category.trash',
      entityType: 'category',
      entityId: id,
      summary: `Moved category ${c.name} to Trash${target ? `; ${c._count.products} product(s) moved to ${target.name}` : ''}`,
    });
    revalidatePath('/categories');
    revalidatePath('/products');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

export async function restoreCategory(id: string): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const c = await prisma.category.findUnique({ where: { id }, select: { name: true, deletedAt: true } });
    if (!c || !c.deletedAt) return { error: 'That category isn’t in Trash.' };
    const clash = await prisma.category.findFirst({ where: { id: { not: id }, deletedAt: null, name: { equals: c.name, mode: 'insensitive' } }, select: { id: true } });
    if (clash) return { error: `Another category is already called ${c.name}. Rename that one first.` };
    await prisma.category.update({ where: { id }, data: { deletedAt: null } });
    await logActivity({ userId: user.id, action: 'category.restore', entityType: 'category', entityId: id, summary: `Restored category ${c.name}` });
    revalidatePath('/categories');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

/** Deletes a category in Trash for good, freeing its slug. */
export async function purgeCategory(id: string): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!c) return {};
    if (!c.deletedAt) return { error: 'Move the category to Trash first.' };
    if (c._count.products > 0) return { error: 'Products still use this category. Restore it and move them first.' };
    await prisma.category.delete({ where: { id } });
    if (c.imageUrl) await deleteUploadedImage(c.imageUrl);
    await logActivity({ userId: user.id, action: 'category.delete', entityType: 'category', entityId: id, summary: `Deleted category ${c.name} for good` });
    revalidatePath('/categories');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
