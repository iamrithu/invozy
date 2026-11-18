'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';

// Customers › Delivery routes. A route is the name on Customer.route (set
// in the customer form); this groups customers and their open orders by it.

export type RouteRow = {
  route: string;
  customers: { id: string; name: string; phone: string | null }[];
  openOrders: { id: string; number: string; status: string; total: number; slot: string | null; customer: string }[];
  openValue: number;
};

export async function listRoutes(): Promise<{ routes: RouteRow[]; unrouted: number }> {
  await requireUser();
  const [customers, orders] = await Promise.all([
    prisma.customer.findMany({ where: { active: true, guest: false }, orderBy: { name: 'asc' }, select: { id: true, name: true, shopName: true, phone: true, route: true } }),
    prisma.order.findMany({
      where: { status: { in: ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, number: true, status: true, total: true, deliverySlot: true, customer: { select: { name: true, shopName: true, route: true } } },
    }),
  ]);
  const map = new Map<string, RouteRow>();
  const key = (r: string | null) => r?.trim() || '';
  for (const c of customers) {
    const k = key(c.route);
    if (!k) continue;
    const row = map.get(k) ?? { route: k, customers: [], openOrders: [], openValue: 0 };
    row.customers.push({ id: c.id, name: c.shopName || c.name, phone: c.phone });
    map.set(k, row);
  }
  for (const o of orders) {
    const k = key(o.customer.route);
    if (!k) continue;
    const row = map.get(k) ?? { route: k, customers: [], openOrders: [], openValue: 0 };
    row.openOrders.push({ id: o.id, number: o.number, status: o.status, total: Number(o.total), slot: o.deliverySlot, customer: o.customer.shopName || o.customer.name });
    row.openValue += Number(o.total);
    map.set(k, row);
  }
  return {
    routes: Array.from(map.values()).sort((a, b) => a.route.localeCompare(b.route)),
    unrouted: customers.filter((c) => !key(c.route)).length,
  };
}

const RenameSchema = z.object({ from: z.string().trim().min(1), to: z.string().trim().min(1, 'Give the route a name.').max(60) });

/** Renames a route on every customer on it. */
export async function renameRoute(input: z.input<typeof RenameSchema>): Promise<ActionResult<{ moved: number }>> {
  try {
    const user = await requireOwner();
    const { from, to } = RenameSchema.parse(input);
    const r = await prisma.customer.updateMany({ where: { route: from }, data: { route: to } });
    await logActivity({ userId: user.id, action: 'customer.route', entityType: 'customer', summary: `Renamed route ${from} to ${to} (${r.count} customers)` });
    revalidatePath('/delivery-routes');
    return { moved: r.count };
  } catch (e) {
    return toActionError(e);
  }
}
