'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';

/** Powers the top-bar search dropdown and the ⌘K command palette — both
 * need the same cross-entity lookup, capped small since it's a live-type search. */
export async function globalSearch(term: string) {
  const q = term.trim();
  if (!q) return { products: [], customers: [], invoices: [] };
  await requireUser();

  const [products, customers, invoices] = await Promise.all([
    prisma.product.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { id: true, name: true, category: true, unit: true, price: true, active: true },
      take: 5,
      orderBy: { name: 'asc' },
    }),
    prisma.customer.findMany({
      where: {
        guest: false,
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { shopName: { contains: q, mode: 'insensitive' } }],
      },
      take: 5,
      orderBy: { name: 'asc' },
    }),
    prisma.invoice.findMany({
      where: {
        OR: [
          { number: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { customer: { shopName: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: { id: true, number: true, date: true, status: true, total: true, customer: { select: { name: true, shopName: true } } },
      take: 5,
      orderBy: { date: 'desc' },
    }),
  ]);

  return JSON.parse(JSON.stringify({ products, customers, invoices }));
}
