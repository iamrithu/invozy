import { prisma } from './prisma';
import { getCompany } from './get-company';
import { requireUser } from './session';
import { getChecklistState, hasSavedPdfLayout } from './settings';
import { isModuleEnabled } from './modules';

// The dashboard's "get set up" card for a new company: each item is worked
// out from the company's real data, links to where it's done, and a few that
// can't be detected (or don't apply to everyone) can be ticked by hand.
// Owners only; gone once everything is done or the owner hides it.

export type ChecklistItem = { key: string; label: string; hint: string; href: string; done: boolean; canMark: boolean };
export type Checklist = { items: ChecklistItem[]; done: number; total: number };

export async function loadSetupChecklist(): Promise<Checklist | null> {
  const user = await requireUser();
  if (user.role !== 'OWNER' || user.viewOnly) return null;
  const state = await getChecklistState();
  if (state.dismissed) return null;
  const company = await getCompany();
  const [products, customers, invoices, logins, pdfSaved] = await Promise.all([
    prisma.product.count(),
    prisma.customer.count({ where: { guest: false } }),
    prisma.invoice.count(),
    prisma.user.count(),
    hasSavedPdfLayout(),
  ]);
  const marked = new Set(state.marked);
  const items: ChecklistItem[] = [
    { key: 'details', label: 'Add your business address and phone', hint: 'They print at the top of every invoice.', href: '/company', done: !!company.address && !!company.phone, canMark: false },
    { key: 'gstin', label: 'Add your GSTIN', hint: 'Skip this if you aren’t GST-registered.', href: '/company', done: !!company.gstin || marked.has('gstin'), canMark: true },
    { key: 'logo', label: 'Upload your logo', hint: 'Shown on invoices, receipts and statements.', href: '/company', done: !!company.logoUrl || marked.has('logo'), canMark: true },
    { key: 'bank', label: 'Add bank or UPI details', hint: 'So customers know how to pay you.', href: '/company', done: !!company.bankAcc || !!company.upi, canMark: false },
    { key: 'design', label: 'Choose how invoices look', hint: 'Pick a template and page layout.', href: '/company', done: pdfSaved || company.invoiceTemplate !== 'MODERN' || marked.has('design'), canMark: true },
    { key: 'product', label: 'Add your first product', hint: 'Prices, units and GST live here.', href: '/products', done: products > 0, canMark: false },
    { key: 'customer', label: 'Add your first customer', hint: 'Their state decides CGST + SGST or IGST.', href: '/customers', done: customers > 0, canMark: false },
    { key: 'invoice', label: 'Make your first invoice', hint: 'It takes about a minute.', href: '/invoices/new', done: invoices > 0, canMark: false },
    ...(isModuleEnabled(company.disabledModules, 'team')
      ? [{ key: 'team', label: 'Invite someone to help', hint: 'Give staff their own login.', href: '/team', done: logins > 1 || marked.has('team'), canMark: true }]
      : []),
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return { items, done, total: items.length };
}
