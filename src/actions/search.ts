'use server';

import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';

/** Powers the top-bar search dropdown and the ⌘K command palette — both
 * need the same cross-entity lookup, capped small since it's a live-type search. */
export async function globalSearch(term: string) {
  const q = term.trim();
  if (!q) return { products: [], customers: [], invoices: [] };
  const company = await getCompany();

  const [products, customers, invoices] = await Promise.all([
    prisma.product.findMany({
      where: { companyId: company.id, name: { contains: q, mode: 'insensitive' } },
      take: 5,
      orderBy: { name: 'asc' },
    }),
    prisma.customer.findMany({
      where: {
        companyId: company.id,
        guest: false,
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { shopName: { contains: q, mode: 'insensitive' } }],
      },
      take: 5,
      orderBy: { name: 'asc' },
    }),
    prisma.invoice.findMany({
      where: {
        companyId: company.id,
        OR: [
          { number: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { customer: { shopName: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: { customer: { select: { name: true, shopName: true } } },
      take: 5,
      orderBy: { date: 'desc' },
    }),
  ]);

  return JSON.parse(JSON.stringify({ products, customers, invoices }));
}
