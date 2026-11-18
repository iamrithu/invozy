import type { Tx } from '@/lib/prisma';
import { slugify } from '@/lib/slug';

// Server-only category helpers shared by src/actions/categories.ts and
// src/actions/products.ts. Kept out of the 'use server' file on purpose:
// everything exported there becomes an endpoint the browser can call.

/** A free slug for `base` in this company. Trash counts: its slugs stay
 * reserved so a restore never clashes. */
export async function freeCategorySlug(db: Tx, base: string, exceptId?: string): Promise<string> {
  const root = slugify(base) || 'category';
  let slug = root;
  for (let i = 2; i < 200; i++) {
    const clash = await db.category.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
    slug = `${root}-${i}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** The category a product form's typed name refers to, created when it's
 * new. `keepId` lets a product keep a category that has since been disabled. */
export async function resolveCategoryForProduct(
  tx: Tx,
  rawName: string,
  keepId?: string | null
): Promise<{ category: { id: string; name: string } } | { error: string }> {
  const name = rawName.trim();
  if (!name) return { error: 'Pick a category.' };
  const found = await tx.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    orderBy: { deletedAt: { sort: 'desc', nulls: 'first' } },
    select: { id: true, name: true, status: true, deletedAt: true },
  });
  if (found) {
    if (found.deletedAt) return { error: `${found.name} is in Trash. Restore it in Catalog › Categories, or pick another category.` };
    if (found.status === 'DISABLED' && found.id !== keepId) return { error: `${found.name} is disabled. Turn it on in Catalog › Categories, or pick another category.` };
    return { category: { id: found.id, name: found.name } };
  }
  const last = await tx.category.aggregate({ _max: { sortOrder: true } });
  const created = await tx.category.create({
    data: { name, slug: await freeCategorySlug(tx, name), sortOrder: (last._max.sortOrder ?? 0) + 1 },
    select: { id: true, name: true },
  });
  return { category: created };
}
