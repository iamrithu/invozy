'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';

// Catalog › Price lists: the catalog's unit prices and every customer's
// special prices on one screen. Prices are still stored where they were
// (ProductPriceTier, CustomerPrice); changes go through the existing
// actions in src/actions/pricing.ts.

export type CatalogPriceRow = { id: string; name: string; category: string; active: boolean; tiers: { unit: string; price: number }[]; specialCount: number };
export type SpecialPriceRow = { id: string; customerId: string; customerName: string; productId: string; productName: string; unit: string; price: number; catalogPrice: number | null };

export async function getPriceLists(): Promise<{ catalog: CatalogPriceRow[]; specials: SpecialPriceRow[] }> {
  await requireUser();
  const [products, specials] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true, active: true, unit: true, price: true, priceTiers: { orderBy: { sortOrder: 'asc' }, select: { unit: true, price: true } }, _count: { select: { customerPrices: true } } },
    }),
    prisma.customerPrice.findMany({
      orderBy: [{ customer: { name: 'asc' } }],
      include: { customer: { select: { name: true, shopName: true } }, product: { select: { name: true } } },
      take: 2000,
    }),
  ]);
  const catalog = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    active: p.active,
    tiers: p.priceTiers.length ? p.priceTiers.map((t) => ({ unit: t.unit, price: Number(t.price) })) : [{ unit: p.unit, price: Number(p.price) }],
    specialCount: p._count.customerPrices,
  }));
  const catalogPrice = new Map(catalog.flatMap((p) => p.tiers.map((t) => [`${p.id}|${t.unit}`, t.price] as const)));
  return {
    catalog,
    specials: specials.map((s) => ({
      id: s.id,
      customerId: s.customerId,
      customerName: s.customer.shopName || s.customer.name,
      productId: s.productId,
      productName: s.product.name,
      unit: s.unit,
      price: Number(s.price),
      catalogPrice: catalogPrice.get(`${s.productId}|${s.unit}`) ?? null,
    })),
  };
}
