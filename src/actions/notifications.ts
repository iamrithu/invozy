'use server';

import { createHash } from 'node:crypto';
import { listOverdueForReminders } from '@/actions/invoices';
import { getDraftsHoldingStock, getInventorySummary } from '@/actions/inventory';
import { getFrequentCustomItems } from '@/actions/products';
import { getCompany } from '@/lib/get-company';
import { isModuleEnabled } from '@/lib/modules';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { toActionError } from '@/lib/action-result';
import { getUserFlag, isMissingTable, setUserFlag } from '@/lib/settings';
import { todayIst, istDayRangeUtc } from '@/lib/dates';
import { fmtInr } from '@/lib/gst';

// The bell in the top bar. Everything that needs the owner's attention —
// overdue invoices, drafts holding stock, stock running out, batches
// expiring, an incomplete company profile — used to be stacked as banners on
// the dashboard; it's collected here instead, each with the action that
// clears it. Nothing is stored: every notification is derived from the
// current data, so it disappears by itself once the underlying problem is
// fixed. "Read" is per login (NotificationRead) and keyed on `signature`,
// which changes whenever the set behind a notification changes — a new
// overdue invoice makes "Overdue invoices" unread again. Until the
// NotificationRead table exists (`npm run db:deploy`), `reads` comes back
// null and the bell remembers in the browser instead.

export type NotificationAction =
  | { kind: 'remind'; invoiceId: string; number: string; phone: string | null; customer: string; balance: number; due: string }
  | { kind: 'send-draft'; invoiceId: string; number: string };

export type NotificationEntry = {
  id: string;
  label: string;
  sub: string;
  /** Right-aligned figure ("₹2,940.00", "2 Box + 6 Pc"). */
  value?: string;
  href: string;
  action?: NotificationAction;
};

export type NotificationItem = {
  id: 'overdue' | 'drafts' | 'stock' | 'expiring' | 'profile' | 'catalog';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  signature: string;
  /** Where "view all" goes. */
  href: string;
  hrefLabel: string;
  entries: NotificationEntry[];
};

function sig(parts: (string | number)[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

const DAY_MS = 24 * 3600 * 1000;

/** Every open notification, most urgent first. Each source is independent —
 * one failing (e.g. inventory) never hides the others. */
export type NotificationsResult = {
  items: NotificationItem[];
  /** notificationId → signature this login has read; null when per-login
   * read state isn't available yet (table not migrated). */
  reads: Record<string, string> | null;
  /** Whether this login gets the 8 AM summary email — null for logins it
   * doesn't apply to (staff, or no email on the login). */
  dailyDigest: boolean | null;
};

async function readsFor(userId: string): Promise<Record<string, string> | null> {
  try {
    const rows = await prisma.notificationRead.findMany({ where: { userId }, select: { notificationId: true, signature: true } });
    return Object.fromEntries(rows.map((r) => [r.notificationId, r.signature]));
  } catch (err) {
    if (!isMissingTable(err)) console.error('notification reads failed', err);
    return null;
  }
}

export async function getNotifications(): Promise<NotificationsResult> {
  const [user, company] = await Promise.all([requireUser(), getCompany()]);
  // Inventory switched off for this company (src/lib/modules.ts): no stock
  // alerts — "drafts holding stock", low/out of stock, expiring batches.
  const inventoryOn = isModuleEnabled(company.disabledModules, 'inventory');
  const [overdue, drafts, stock, catalog, reads, dailyDigest] = await Promise.all([
    listOverdueForReminders().catch(() => []),
    inventoryOn ? getDraftsHoldingStock().catch(() => null) : null,
    inventoryOn ? getInventorySummary().catch(() => null) : null,
    getFrequentCustomItems().catch(() => []),
    readsFor(user.id),
    user.role === 'OWNER' && user.email ? getUserFlag(user.id, 'dailyDigest', true) : Promise.resolve(null),
  ]);
  const cur = company.currency;
  const today = istDayRangeUtc(todayIst()).gte.getTime();
  const items: NotificationItem[] = [];

  if (overdue.length) {
    const total = overdue.reduce((s, o) => s + o.balance, 0);
    items.push({
      id: 'overdue',
      severity: 'critical',
      title: `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue`,
      detail: `${fmtInr(total, cur)} past the due date. Send a WhatsApp reminder or record the payment.`,
      signature: sig(overdue.map((o) => `${o.id}:${o.balance}`)),
      href: '/invoices?remind=1',
      hrefLabel: 'Remind all',
      entries: overdue.slice(0, 5).map((o) => {
        const days = Math.max(1, Math.floor((today - istDayRangeUtc(o.due).gte.getTime()) / DAY_MS));
        return {
          id: o.id,
          label: o.customer,
          sub: `${o.number} · ${days} day${days === 1 ? '' : 's'} late${o.lastRemindedAt ? ' · reminded' : ''}`,
          value: fmtInr(o.balance, cur),
          href: `/invoices/${o.id}`,
          action: { kind: 'remind', invoiceId: o.id, number: o.number, phone: o.phone, customer: o.customer, balance: o.balance, due: o.due },
        };
      }),
    });
  }

  if (drafts && drafts.count > 0) {
    items.push({
      id: 'drafts',
      severity: 'warning',
      title: `${drafts.count} draft${drafts.count === 1 ? ' is' : 's are'} holding stock`,
      detail: 'Their items are set aside and unavailable for other invoices. Send them, or delete the ones that won’t go out.',
      signature: sig([drafts.count, ...drafts.drafts.map((d) => d.id)]),
      href: '/invoices?status=DRAFT',
      hrefLabel: 'All drafts',
      entries: drafts.drafts.map((d) => ({
        id: d.id,
        label: d.customer,
        sub: `${d.number} · ${d.items} item${d.items === 1 ? '' : 's'} · ${d.ageDays === 0 ? 'today' : `${d.ageDays} day${d.ageDays === 1 ? '' : 's'} old`}`,
        value: fmtInr(d.total, cur),
        href: `/invoices/${d.id}`,
        action: { kind: 'send-draft', invoiceId: d.id, number: d.number },
      })),
    });
  }

  if (stock && stock.out + stock.low > 0) {
    items.push({
      id: 'stock',
      severity: stock.out > 0 ? 'warning' : 'info',
      title: [stock.out ? `${stock.out} out of stock` : null, stock.low ? `${stock.low} running low` : null].filter(Boolean).join(' · '),
      detail: 'Add stock before these block an invoice.',
      signature: sig([stock.out, stock.low, ...stock.lowItems.map((p) => `${p.id}:${p.status}`)]),
      href: `/inventory?status=${stock.out > 0 ? 'out' : 'low'}`,
      hrefLabel: 'Inventory',
      entries: stock.lowItems.map((p) => ({
        id: p.id,
        label: p.name,
        sub: p.status === 'out' ? 'Out of stock' : `Low${p.alertText ? ` · ${p.alertText}` : ''}`,
        value: p.stockText,
        href: `/inventory/${p.id}`,
      })),
    });
  }

  if (stock && stock.expiringCount > 0) {
    items.push({
      id: 'expiring',
      severity: 'warning',
      title: `${stock.expiringCount} batch${stock.expiringCount === 1 ? '' : 'es'} expiring soon`,
      detail: `Within the next ${company.expiryAlertDays} days. Sell these first, or write them off.`,
      signature: sig(stock.expiring.map((b) => `${b.productId}:${b.batchNo}:${b.expiryDate}`)),
      href: '/inventory?status=expiring',
      hrefLabel: 'Expiring stock',
      entries: stock.expiring.map((b, i) => ({
        id: `${b.productId}-${i}`,
        label: b.name,
        sub: `${b.batchNo ? `Batch ${b.batchNo} · ` : ''}${b.daysToExpiry <= 0 ? 'expired' : `expires in ${b.daysToExpiry} day${b.daysToExpiry === 1 ? '' : 's'}`}`,
        value: b.remainingText,
        href: `/inventory/${b.productId}`,
      })),
    });
  }

  const missing = [!company.gstin && 'GSTIN', !company.bankAcc && 'bank details'].filter(Boolean) as string[];
  if (missing.length) {
    items.push({
      id: 'profile',
      severity: 'info',
      title: 'Company profile isn’t complete',
      detail: `Add your ${missing.join(' and ')} so every invoice prints complete.`,
      signature: sig(missing),
      href: '/company',
      hrefLabel: 'Company profile',
      entries: [],
    });
  }

  if (catalog.length) {
    const top = catalog[0];
    items.push({
      id: 'catalog',
      severity: 'info',
      title: `“${top.name}” billed ${top.count} times by hand`,
      detail: 'Add it to your catalog once and it shows up in search next time.',
      signature: sig(catalog.map((c) => `${c.name}:${c.count}`)),
      href: `/products?addName=${encodeURIComponent(top.name)}&addUnit=${encodeURIComponent(top.unit)}&addRate=${top.rate}`,
      hrefLabel: 'Add to catalog',
      entries: [],
    });
  }

  return { items, reads, dailyDigest };
}

/** Marks the given notifications read (at their current signatures) for
 * this login. Quietly does nothing before the table exists — the bell
 * falls back to the browser then. */
export async function markNotificationsRead(entries: { id: string; signature: string }[]): Promise<{ error?: string; stored?: boolean }> {
  try {
    const user = await requireUser();
    const clean = entries.filter((e) => typeof e.id === 'string' && typeof e.signature === 'string').slice(0, 20);
    await prisma.$transaction(
      clean.map((e) =>
        prisma.notificationRead.upsert({
          where: { userId_notificationId: { userId: user.id, notificationId: e.id } },
          create: { userId: user.id, notificationId: e.id, signature: e.signature },
          update: { signature: e.signature, readAt: new Date() },
        })
      )
    );
    return { stored: true };
  } catch (err) {
    if (isMissingTable(err)) return { stored: false };
    return toActionError(err);
  }
}

/** Turns this owner's 8 AM summary email on or off. */
export async function setDailyDigest(enabled: boolean): Promise<{ error?: string }> {
  try {
    const user = await requireUser();
    if (user.role !== 'OWNER' || !user.email) return { error: 'The daily summary goes to owner logins with an email address.' };
    await setUserFlag(user.id, 'dailyDigest', enabled);
    return {};
  } catch (err) {
    return toActionError(err);
  }
}
