import { cache } from 'react';
import { rootPrisma, prisma } from '@/lib/prisma';
import { runWithTenant } from '@/lib/tenant';
import { effectiveDisabledModules, subscriptionView } from '@/lib/entitlements';
import { readStoreSettings, type StoreSettings } from '@/lib/store-settings';

// What a visitor to /s/<slug> sees. No login: the company is found by its
// store slug with the unscoped client, then everything else is read inside
// runWithTenant for that company only. A store is open when it is switched
// on and the company's subscription isn't locked.

export type StoreProduct = {
  id: string;
  name: string;
  desc: string | null;
  image: string | null;
  categoryId: string;
  units: { unit: string; price: number }[];
};

export type StoreCategory = { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; productCount: number };

export type PublicStore = {
  companyId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  themeColor: string;
  state: string;
  phone: string | null;
  settings: StoreSettings;
  categories: StoreCategory[];
  products: StoreProduct[];
  zoneCount: number;
};

/** The company behind a store slug, if its store is open. */
export async function findOpenStore(slug: string) {
  const company = await rootPrisma.company.findFirst({
    where: { storeSlug: slug.toLowerCase(), storeEnabled: true, active: true },
  });
  if (!company) return null;
  if (subscriptionView(company).state === 'locked') return null;
  // The plan (or the platform admin) decides whether the store is included.
  const disabledModules = effectiveDisabledModules(company);
  if (disabledModules.includes('storefront')) return null;
  return { ...company, disabledModules };
}

export const loadStore = cache(async (slug: string): Promise<PublicStore | null> => {
  const company = await findOpenStore(slug);
  if (!company) return null;
  return runWithTenant(company.id, async () => {
    const [categories, products, zoneCount] = await Promise.all([
      prisma.category.findMany({
        where: { deletedAt: null, status: 'ACTIVE', showOnStore: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, slug: true, description: true, imageUrl: true },
      }),
      prisma.product.findMany({
        where: { active: true, categoryRef: { is: { deletedAt: null, status: 'ACTIVE', showOnStore: true } } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, desc: true, images: true, categoryId: true, unit: true, price: true, priceTiers: { orderBy: { sortOrder: 'asc' }, select: { unit: true, price: true } } },
      }),
      prisma.deliveryZone.count({ where: { active: true } }),
    ]);
    const storeProducts: StoreProduct[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      desc: p.desc,
      image: p.images[0] ?? null,
      categoryId: p.categoryId!,
      units: p.priceTiers.length ? p.priceTiers.map((t) => ({ unit: t.unit, price: Number(t.price) })) : [{ unit: p.unit, price: Number(p.price) }],
    }));
    return {
      companyId: company.id,
      slug: company.storeSlug!,
      name: company.name,
      logoUrl: company.logoUrl,
      themeColor: company.themeColor,
      state: company.state,
      phone: company.phone,
      settings: readStoreSettings(company.storeSettings),
      categories: categories.map((c) => ({ ...c, productCount: storeProducts.filter((p) => p.categoryId === c.id).length })).filter((c) => c.productCount > 0),
      products: storeProducts,
      zoneCount,
    };
  });
});
