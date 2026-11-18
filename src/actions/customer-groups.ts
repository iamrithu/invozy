'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';

// Customers › Customer groups: Retail, Wholesale, Distributor… Coupons and
// automatic discounts can be limited to groups (Coupon.customerGroupIds).

export type CustomerGroupRow = { id: string; name: string; description: string | null; color: string; customerCount: number };

export async function listCustomerGroups(): Promise<CustomerGroupRow[]> {
  await requireUser();
  const rows = await prisma.customerGroup.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { customers: true } } } });
  return rows.map((g) => ({ id: g.id, name: g.name, description: g.description, color: g.color, customerCount: g._count.customers }));
}

export async function listCustomerGroupOptions(): Promise<{ id: string; name: string }[]> {
  await requireUser();
  return prisma.customerGroup.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
}

/** Customers in a group (or, with `groupId` null, every active customer
 * with the group they're in) — for the group's member picker. */
export async function listGroupMembers(): Promise<{ id: string; name: string; shopName: string | null; phone: string | null; groupId: string | null }[]> {
  await requireUser();
  return prisma.customer.findMany({
    where: { active: true, guest: false },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, shopName: true, phone: true, groupId: true },
    take: 2000,
  });
}

const COLORS = ['slate', 'blue', 'green', 'gold', 'violet', 'brand'] as const;
const GroupSchema = z.object({
  name: z.string().trim().min(1, 'Give the group a name.').max(40, 'Keep the name under 40 characters.'),
  description: z.string().trim().max(200).optional().nullable(),
  color: z.enum(COLORS).default('slate'),
});

export type GroupInput = z.input<typeof GroupSchema>;

export async function saveCustomerGroup(id: string | null, input: GroupInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireOwner();
    const parsed = GroupSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the group.' };
    const d = parsed.data;
    const clash = await prisma.customerGroup.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (clash) return { error: `There is already a group called ${d.name}.` };
    const data = { name: d.name, description: d.description?.trim() || null, color: d.color };
    const g = id ? await prisma.customerGroup.update({ where: { id }, data }) : await prisma.customerGroup.create({ data });
    await logActivity({ userId: user.id, action: id ? 'customer-group.update' : 'customer-group.create', entityType: 'customer-group', entityId: g.id, summary: `${id ? 'Updated' : 'Added'} customer group ${g.name}` });
    revalidatePath('/customer-groups');
    return { id: g.id };
  } catch (e) {
    return toActionError(e);
  }
}

/** Deletes a group; its customers simply have no group any more. Coupons
 * limited to it lose that limit only for this group. */
export async function deleteCustomerGroup(id: string): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const g = await prisma.customerGroup.findUnique({ where: { id }, select: { name: true } });
    if (!g) return {};
    await prisma.$transaction(async (tx) => {
      await tx.customer.updateMany({ where: { groupId: id }, data: { groupId: null } });
      const limited = await tx.coupon.findMany({ where: { customerGroupIds: { has: id } }, select: { id: true, customerGroupIds: true } });
      for (const c of limited) await tx.coupon.update({ where: { id: c.id }, data: { customerGroupIds: c.customerGroupIds.filter((x) => x !== id) } });
      await tx.customerGroup.delete({ where: { id } });
    });
    await logActivity({ userId: user.id, action: 'customer-group.delete', entityType: 'customer-group', entityId: id, summary: `Deleted customer group ${g.name}` });
    revalidatePath('/customer-groups');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

/** Puts customers into a group (moving them out of any other), or with
 * `groupId` null takes them out of their group. */
export async function setCustomersGroup(customerIds: string[], groupId: string | null): Promise<ActionResult<{ moved: number }>> {
  try {
    const user = await requireUser();
    const ids = Array.from(new Set(customerIds)).slice(0, 2000);
    if (groupId && !(await prisma.customerGroup.findUnique({ where: { id: groupId }, select: { id: true } }))) return { error: 'That group no longer exists.' };
    const r = await prisma.customer.updateMany({ where: { id: { in: ids } }, data: { groupId } });
    await logActivity({ userId: user.id, action: 'customer-group.members', entityType: 'customer-group', entityId: groupId, summary: groupId ? `Added ${r.count} customer(s) to a group` : `Took ${r.count} customer(s) out of their group` });
    revalidatePath('/customer-groups');
    revalidatePath('/customers');
    return { moved: r.count };
  } catch (e) {
    return toActionError(e);
  }
}
