'use server';

import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { computeTotals } from '@/lib/gst';

async function allInvoicesWithTotals() {
  const company = await getCompany();
  const invoices = await prisma.invoice.findMany({
    where: { companyId: company.id },
    include: { customer: true, items: true, payments: true },
  });
  return invoices.map((inv) => {
    const totals = computeTotals(
      inv.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) })),
      { type: inv.overallDiscountType, value: Number(inv.overallDiscountValue) },
      {
        cgstRate: Number(company.cgstRate),
        sgstRate: Number(company.sgstRate),
        igstRate: Number(company.igstRate),
        cgstEnabled: company.cgstEnabled,
        sgstEnabled: company.sgstEnabled,
        igstEnabled: company.igstEnabled,
      },
      company.state,
      inv.customer.state
    );
    const amountPaid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    return { invoice: inv, totals, amountPaid, balanceDue: totals.total - amountPaid };
  });
}

export async function getDashboardStats() {
  const company = await getCompany();
  const all = await allInvoicesWithTotals();
  const totalInvoiced = all.reduce((s, r) => s + r.totals.total, 0);
  const outstanding = all.reduce((s, r) => s + Math.max(r.balanceDue, 0), 0);
  const collected = all.reduce((s, r) => s + r.amountPaid, 0);
  const [activeProducts, customerCount] = await Promise.all([
    prisma.product.count({ where: { companyId: company.id, active: true } }),
    prisma.customer.count({ where: { companyId: company.id, guest: false } }),
  ]);
  const overdue = all.filter((r) => r.invoice.status !== 'PAID' && r.invoice.due < new Date());
  const overdueTotal = overdue.reduce((s, r) => s + Math.max(r.balanceDue, 0), 0);

  const recent = all
    .sort((a, b) => b.invoice.date.getTime() - a.invoice.date.getTime())
    .slice(0, 8);

  return {
    totalInvoiced,
    outstanding,
    collected,
    activeProducts,
    customerCount,
    overdueCount: overdue.length,
    overdueTotal,
    recent,
  };
}

export async function getReportStats() {
  const all = (await allInvoicesWithTotals()).filter((r) => r.invoice.status !== 'DRAFT');
  return all.reduce(
    (acc, r) => ({
      taxable: acc.taxable + r.totals.taxable,
      cgst: acc.cgst + r.totals.cgst,
      sgst: acc.sgst + r.totals.sgst,
      igst: acc.igst + r.totals.igst,
      total: acc.total + r.totals.total,
      outstanding: acc.outstanding + Math.max(r.balanceDue, 0),
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, outstanding: 0 }
  );
}

export async function getBillingTrend(months = 6) {
  const all = await allInvoicesWithTotals();
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys.map((key) => {
    const total = all
      .filter((r) => r.invoice.date.toISOString().slice(0, 7) === key)
      .reduce((s, r) => s + r.totals.total, 0);
    return { month: key, total };
  });
}

export async function getCollectedTrend(months = 6) {
  const company = await getCompany();
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const payments = await prisma.payment.findMany({ where: { invoice: { companyId: company.id } } });
  return keys.map((key) => ({
    month: key,
    total: payments.filter((p) => p.date.toISOString().slice(0, 7) === key).reduce((s, p) => s + Number(p.amount), 0),
  }));
}

export async function getMonthOverMonth() {
  const all = await allInvoicesWithTotals();
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthTotal = all.filter((r) => r.invoice.date.toISOString().slice(0, 7) === thisKey).reduce((s, r) => s + r.totals.total, 0);
  const lastMonthTotal = all.filter((r) => r.invoice.date.toISOString().slice(0, 7) === lastKey).reduce((s, r) => s + r.totals.total, 0);
  return {
    thisMonthLabel: now.toLocaleDateString('en-IN', { month: 'long' }),
    lastMonthLabel: lastDate.toLocaleDateString('en-IN', { month: 'long' }),
    thisMonthTotal,
    lastMonthTotal,
  };
}

export async function getTopCustomers() {
  const all = await allInvoicesWithTotals();
  const byCustomer = new Map<string, { name: string; state: string; total: number; balance: number; count: number }>();
  for (const r of all) {
    const key = r.invoice.customerId;
    const entry = byCustomer.get(key) ?? { name: r.invoice.customer.name, state: r.invoice.customer.state, total: 0, balance: 0, count: 0 };
    entry.total += r.totals.total;
    entry.balance += Math.max(r.balanceDue, 0);
    entry.count += 1;
    byCustomer.set(key, entry);
  }
  return Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
}
