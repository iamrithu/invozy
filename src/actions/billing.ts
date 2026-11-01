'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { customerOutstanding } from '@/lib/invoice-totals';

/** Every customer the invoice builder's Bill To picker can choose from —
 * loaded once and filtered in the browser as the user types (by name, shop
 * name or phone), instead of the old "first 8 matches" server search that
 * left most of the directory unreachable. A single company's directory is
 * small enough (hundreds, not millions) for this to be the faster option.
 * Disabled customers are left out; walk-in guests are included but the
 * picker only shows them once something is typed. */
export async function listCustomersForBilling() {
  await requireUser();
  const customers = await prisma.customer.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      shopName: true,
      contact: true,
      phone: true,
      altPhone: true,
      email: true,
      address: true,
      gstin: true,
      state: true,
      guest: true,
      creditLimit: true,
      fssaiNo: true,
      pincode: true,
      route: true,
      active: true,
    },
    orderBy: { name: 'asc' },
  });
  return customers.map((c) => ({ ...c, creditLimit: Number(c.creditLimit) }));
}

/** What a customer owes on their *other* invoices — the builder's "Already
 * owes ₹X" line and credit-limit check. `excludeInvoiceId` leaves out the
 * invoice being edited, which the old ledger-based figure double-counted. */
export async function getCustomerBalance(customerId: string, excludeInvoiceId?: string) {
  await requireUser();
  return { outstanding: await customerOutstanding(customerId, excludeInvoiceId) };
}
