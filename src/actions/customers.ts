'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { Customer, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { requireOwner, requireUser } from '@/lib/session';
import { recomputeStoredTotals } from '@/lib/invoice-totals';
import { saveUploadedImage, deleteUploadedImage } from '@/lib/uploads';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { customerDisplayName } from '@/lib/customer';

const MAX_IMAGES = 6;

const CustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  shopName: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  altPhone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  state: z.string().min(1),
  district: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  terms: z.string().default('Due on receipt'),
  creditLimit: z.coerce.number().min(0).default(0),
  fssaiNo: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  // Delivery route/beat — free text, but trimmed and blank-as-null so the
  // loading sheet's grouping doesn't split "Ennore" and "Ennore ". Left
  // undefined (untouched) when a caller's form doesn't carry the field.
  route: z
    .string()
    .transform((v) => v.trim() || null)
    .optional()
    .nullable(),
});

export type CustomerFormState = { error?: string; fieldErrors?: Record<string, string>; id?: string; customer?: any };

export type CustomerSort = 'name' | 'billed-desc';

/** Which side of the Enable/Disable switch the Customers list shows. */
export type CustomerStatus = 'active' | 'disabled' | 'all';

/** "Active"/"Disabled" switch value from a form — undefined when the form
 * doesn't carry one (e.g. the invoice builder's quick add), which leaves
 * the stored value alone. */
function parseActive(formData: FormData): boolean | undefined {
  const raw = formData.get('active');
  if (raw === null) return undefined;
  return raw === 'true' || raw === 'on';
}

/** Uploads the `newImages` files (at most `room` of them). All-or-nothing:
 * if any upload fails, the ones that did succeed are deleted again before
 * the error is rethrown, so a failed save never leaves orphaned files. */
async function uploadNewImages(formData: FormData, room: number): Promise<string[]> {
  const files = formData
    .getAll('newImages')
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, Math.max(room, 0));
  const results = await Promise.allSettled(files.map((f) => saveUploadedImage(f, 'customers')));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  const uploaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (failed) {
    await Promise.all(uploaded.map(deleteUploadedImage));
    throw failed.reason instanceof Error ? failed.reason : new Error('Could not upload photo.');
  }
  return uploaded;
}

/** Invoice count per customer for one page of rows — lets the list's
 * delete dialog say up front whether a customer can be deleted or has to
 * be disabled instead, without a round-trip that's bound to fail. */
async function withInvoiceCounts<T extends { id: string }>(items: T[]): Promise<(T & { invoiceCount: number })[]> {
  if (!items.length) return [];
  const rows = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: { customerId: { in: items.map((i) => i.id) } },
    _count: { _all: true },
  });
  const counts = new Map(rows.map((r) => [r.customerId, r._count._all]));
  return items.map((i) => ({ ...i, invoiceCount: counts.get(i.id) ?? 0 }));
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The refusal shown when a customer with documents on file is deleted —
 * GST records must keep those invoices, and they need their customer. */
function deleteBlockedMessage(name: string, invoices: number, creditNotes: number, active: boolean) {
  const docs = [invoices && plural(invoices, 'invoice'), creditNotes && plural(creditNotes, 'credit note')].filter(Boolean).join(' and ');
  return active
    ? `${name} has ${docs} on file, so it can't be deleted. Disable it instead: it disappears from Bill To and the active list, and you can turn it back on any time.`
    : `${name} has ${docs} on file, so it can't be deleted. It's already disabled, so it won't appear in Bill To.`;
}

/** DB-level search/filter/sort/pagination for the Customers list page. §3.5 —
 * guests get a real row (everything downstream depends on a real customer
 * relation) but are excluded from the main directory unless the "Show
 * guests" switch is on. `status` picks active (default), disabled, or all;
 * `counts` are the per-status totals for the same search/state/guest
 * filters, for the status chips.
 *
 * "Billed: high to low" ranks by a per-customer SUM over Invoice's stored
 * totals (one GROUP BY via getCustomerBillingTotals), then sorts the
 * matching customers by it in JS and slices the requested page — Prisma
 * can't ORDER BY a relation aggregate. Every other sort/filter/search runs
 * as a real DB query with skip/take. */
export async function listCustomersPage(opts?: {
  search?: string;
  state?: string;
  sort?: CustomerSort;
  page?: number;
  pageSize?: number;
  includeGuests?: boolean;
  status?: CustomerStatus;
}) {
  await requireUser();
  const page = Math.max(opts?.page ?? 1, 1);
  const pageSize = opts?.pageSize ?? 20;
  const status = opts?.status ?? 'active';
  const search = opts?.search?.trim();
  const base: Prisma.CustomerWhereInput = {
    guest: opts?.includeGuests ? undefined : false,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { shopName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { route: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(opts?.state && opts.state !== 'all' ? { state: opts.state } : {}),
  };
  const where: Prisma.CustomerWhereInput = status === 'all' ? base : { ...base, active: status === 'active' };

  const countsPromise = prisma.customer.groupBy({ by: ['active'], where: base, _count: { _all: true } }).then((rows) => {
    const active = rows.find((r) => r.active)?._count._all ?? 0;
    const disabled = rows.find((r) => !r.active)?._count._all ?? 0;
    return { active, disabled, all: active + disabled };
  });

  let pageRows: Customer[];
  let total: number;
  if (opts?.sort === 'billed-desc') {
    const [all, totals] = await Promise.all([prisma.customer.findMany({ where }), getCustomerBillingTotals()]);
    const sorted = all.sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0));
    pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
    total = sorted.length;
  } else {
    [pageRows, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.customer.count({ where }),
    ]);
  }
  const [items, counts] = await Promise.all([withInvoiceCounts(pageRows), countsPromise]);
  // Decimal fields (creditLimit) don't cross the server-action boundary as
  // class instances — normalize to plain JSON so this is safe to call
  // directly from a client-side React Query queryFn, not just as a prop
  // handed down from a Server Component.
  return { items: JSON.parse(JSON.stringify(items)), total, counts };
}

/** All customer states, for the list page's state filter dropdown — not
 * paginated, so it always reflects every state in the directory even when
 * the current filtered page doesn't happen to include them. */
export async function listCustomerStates() {
  await requireUser();
  const rows = await prisma.customer.findMany({ where: { guest: false }, select: { state: true }, distinct: ['state'] });
  return rows.map((r) => r.state).sort();
}

/** Every route/beat already in use, for the customer form's suggestions —
 * reusing the same spelling keeps the loading sheet's groups together. */
export async function listCustomerRoutes() {
  await requireUser();
  const rows = await prisma.customer.findMany({ where: { route: { not: null } }, select: { route: true }, distinct: ['route'], orderBy: { route: 'asc' } });
  return rows.map((r) => r.route).filter((r): r is string => !!r);
}

/** The full non-guest customer directory (id + display name only), for a
 * "Customer" filter dropdown on the Invoices and Reports list screens —
 * unlike searchCustomersForBilling below, this isn't capped at 8 or gated
 * behind a search term, since a filter dropdown needs every option up
 * front, not just the first few matches. Disabled customers are included
 * (flagged `active: false`) because their old invoices still need
 * filtering. */
export async function listCustomersForFilter() {
  await requireUser();
  const customers = await prisma.customer.findMany({
    where: { guest: false },
    select: { id: true, name: true, shopName: true, active: true },
    orderBy: { name: 'asc' },
  });
  return customers;
}

/** Used by the invoice builder's Bill-To search — deliberately includes guests,
 * since a repeat walk-in should still be findable by name or phone. Disabled
 * customers never show up here: that's the whole point of disabling one. */
export async function searchCustomersForBilling(term: string) {
  await requireUser();
  const customers = term
    ? await prisma.customer.findMany({
        where: {
          active: true,
          OR: [{ name: { contains: term, mode: 'insensitive' } }, { shopName: { contains: term, mode: 'insensitive' } }, { phone: { contains: term } }],
        },
        orderBy: { name: 'asc' },
        take: 8,
      })
    : await prisma.customer.findMany({ where: { guest: false, active: true }, orderBy: { name: 'asc' }, take: 8 });
  // Decimal (creditLimit) doesn't cross the server-action boundary as a class
  // instance — see listCustomersPage for the same normalization.
  return JSON.parse(JSON.stringify(customers));
}

/** Every active customer in one go (guests flagged `guest: true`), for a
 * Bill To picker that loads once and filters as you type instead of
 * querying on every keystroke. */
export async function listCustomersForBilling() {
  await requireUser();
  const customers = await prisma.customer.findMany({ where: { active: true }, orderBy: [{ guest: 'asc' }, { name: 'asc' }] });
  return JSON.parse(JSON.stringify(customers));
}

export async function createCustomer(guest: boolean, _prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  let uploaded: string[] = [];
  try {
    const parsed = CustomerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
    }
    const user = await requireUser();
    uploaded = await uploadNewImages(formData, MAX_IMAGES);
    const customer = await prisma.customer.create({ data: { ...parsed.data, guest, active: parseActive(formData) ?? true, images: uploaded } });
    uploaded = []; // saved — no longer ours to clean up
    await logActivity({
      userId: user.id,
      action: 'customer.create',
      entityType: 'customer',
      entityId: customer.id,
      summary: `Added ${guest ? 'guest ' : ''}customer ${customerDisplayName(customer)}`,
    });
    revalidatePath('/customers');
    return { id: customer.id, customer: JSON.parse(JSON.stringify(customer)) };
  } catch (e) {
    await Promise.all(uploaded.map(deleteUploadedImage));
    return toActionError(e);
  }
}

/** Photos follow the same FormData pattern as products: `images` lists the
 * existing URLs to keep, `newImages` carries new files. The form only sends
 * them alongside `imagesManaged=1` — a caller that never loaded the
 * customer's photos (the invoice builder's edit sheet) must not be read as
 * "remove them all". */
export async function updateCustomer(id: string, _prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  let uploaded: string[] = [];
  try {
    const parsed = CustomerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string> };
    }
    const user = await requireUser();
    const [company, existing] = await Promise.all([
      getCompany(),
      prisma.customer.findUnique({ where: { id }, select: { state: true, images: true, active: true } }),
    ]);
    if (!existing) return { error: 'Customer not found. It may have been deleted.' };

    const active = parseActive(formData);
    let images: string[] | undefined;
    let removed: string[] = [];
    if (formData.get('imagesManaged') === '1') {
      // Only URLs already on this customer can be kept — never an arbitrary
      // URL a request made up.
      const keep = formData.getAll('images').filter((v): v is string => typeof v === 'string' && existing.images.includes(v));
      uploaded = await uploadNewImages(formData, MAX_IMAGES - keep.length);
      images = [...keep, ...uploaded];
      removed = existing.images.filter((url) => !keep.includes(url));
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { ...parsed.data, ...(active !== undefined ? { active } : {}), ...(images ? { images } : {}) },
    });
    uploaded = [];
    // Dropped photos are deleted only now that the new list is saved — doing
    // it first lost them whenever the upload or the save failed.
    await Promise.all(removed.map(deleteUploadedImage));

    // The customer's state decides IGST vs CGST+SGST on each of their
    // invoices, so a state change has to re-derive those invoices' stored
    // totals — exactly as the live computeTotals() on the invoice page will.
    if (existing.state !== parsed.data.state) {
      await recomputeStoredTotals({ customerId: id }, company.state);
      revalidatePath('/invoices');
      revalidatePath('/dashboard');
    }
    const name = customerDisplayName(customer);
    const statusChanged = active !== undefined && active !== existing.active;
    await logActivity({
      userId: user.id,
      action: statusChanged ? (active ? 'customer.enable' : 'customer.disable') : 'customer.update',
      entityType: 'customer',
      entityId: id,
      summary: statusChanged ? `${active ? 'Enabled' : 'Disabled'} customer ${name} (and saved changes)` : `Updated customer ${name}`,
    });
    revalidatePath('/customers');
    return { id, customer: JSON.parse(JSON.stringify(customer)) };
  } catch (e) {
    await Promise.all(uploaded.map(deleteUploadedImage));
    return toActionError(e);
  }
}

/** Enable/Disable — a disabled customer keeps every invoice and payment but
 * drops out of Bill To and the active list. Pass `active` to set it
 * explicitly (safe against a double click); omit it to flip. */
export async function toggleCustomerActive(id: string, active?: boolean): Promise<ActionResult<{ active: boolean }>> {
  try {
    const user = await requireUser();
    const existing = await prisma.customer.findUnique({ where: { id }, select: { active: true, name: true, shopName: true } });
    if (!existing) return { error: 'Customer not found. It may have been deleted.' };
    const next = active ?? !existing.active;
    if (next !== existing.active) {
      await prisma.customer.update({ where: { id }, data: { active: next } });
      await logActivity({
        userId: user.id,
        action: next ? 'customer.enable' : 'customer.disable',
        entityType: 'customer',
        entityId: id,
        summary: `${next ? 'Enabled' : 'Disabled'} customer ${customerDisplayName(existing)}`,
      });
    }
    revalidatePath('/customers');
    return { active: next };
  } catch (e) {
    return toActionError(e);
  }
}

/** Owner-only. A customer with invoices (or credit notes) on file can't be
 * deleted — GST records must keep them — so this returns a readable refusal
 * with `canDisable` set, and the confirm dialog offers "Disable customer"
 * instead. Otherwise the customer, their special prices (cascade) and their
 * photos are removed. */
export async function deleteCustomer(id: string): Promise<ActionResult<{ canDisable: boolean }>> {
  try {
    const user = await requireOwner();
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { name: true, shopName: true, images: true, active: true, _count: { select: { invoices: true, creditNotes: true } } },
    });
    if (!customer) return { error: 'Customer not found. It may already have been deleted.' };
    const name = customerDisplayName(customer);
    const { invoices, creditNotes } = customer._count;
    if (invoices || creditNotes) {
      return { error: deleteBlockedMessage(name, invoices, creditNotes, customer.active), canDisable: customer.active };
    }
    try {
      await prisma.customer.delete({ where: { id } });
    } catch (e: any) {
      // An invoice raced in between the check above and the delete — the
      // foreign key refuses it, same answer as above.
      if (e?.code === 'P2003') return { error: deleteBlockedMessage(name, 1, 0, customer.active), canDisable: customer.active };
      throw e;
    }
    await Promise.all(customer.images.map(deleteUploadedImage));
    await logActivity({ userId: user.id, action: 'customer.delete', entityType: 'customer', entityId: id, summary: `Deleted customer ${name}` });
    revalidatePath('/customers');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

/** Powers the Customers list's "Billed: high to low" sort — one GROUP BY
 * over the stored invoice totals. */
export async function getCustomerBillingTotals(): Promise<Record<string, number>> {
  await requireUser();
  const rows = await prisma.invoice.groupBy({ by: ['customerId'], _sum: { total: true } });
  return Object.fromEntries(rows.map((r) => [r.customerId, Number(r._sum.total ?? 0)]));
}

/** Powers the Customers detail pane's ledger section — invoices + running totals. */
export async function getCustomerLedger(id: string) {
  await requireUser();
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      invoices: {
        select: { id: true, number: true, date: true, due: true, status: true, total: true, amountPaid: true },
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
      },
    },
  });
  if (!customer) throw new Error('Customer not found.');

  const { invoices: rows, ...customerFields } = customer;
  let totalBilled = 0;
  let outstanding = 0;
  const invoices = rows.map((inv) => {
    const total = Number(inv.total);
    const paid = Number(inv.amountPaid);
    totalBilled += total;
    outstanding += Math.max(total - paid, 0);
    return { ...inv, computedTotal: total, amountPaid: paid, balanceDue: total - paid };
  });

  const result = { customer: customerFields, invoices, totalBilled, outstanding, invoiceCount: invoices.length };
  // Same Decimal/Date normalization as listCustomersPage — keeps this safe
  // to call directly from a client-side queryFn.
  return JSON.parse(JSON.stringify(result));
}
