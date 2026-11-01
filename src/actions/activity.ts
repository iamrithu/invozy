'use server';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOwner, requireUser } from '@/lib/session';
import { toActionError } from '@/lib/action-result';
import { istDayRangeUtc } from '@/lib/dates';
import type { ActivityEntry } from '@/lib/activity';

export type ActivityEntityType = ActivityEntry['entityType'];

export type ActivityRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  /** ISO timestamp — formatted for IST on the client. */
  createdAt: string;
  userId: string | null;
  /** Who did it, ready to print: the login's name, else its email/phone;
   * "System" for rows written without a user (scripts, imports). */
  userName: string;
};

export type ActivityFilters = {
  /** One type, or several (the activity screen's chips group e.g.
   * invoices with their payments). */
  entityType?: ActivityEntityType | ActivityEntityType[];
  /** With an entityId this becomes a "history of this one record" query —
   * see RELATED_TYPES and the permission note on listActivity. */
  entityId?: string;
  userId?: string;
  /** IST calendar dates, `YYYY-MM-DD`, both inclusive. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type ActivityPage = { error?: string; items: ActivityRow[]; total: number; page: number; pageSize: number };

/** Rows that belong in one record's history besides its own type: a
 * payment is logged against the invoice it pays (entityId = invoice id),
 * and stock moves are logged against the product they count (entityId =
 * product id), so an invoice's or product's history shows those too. */
const RELATED_TYPES: Partial<Record<ActivityEntityType, ActivityEntityType[]>> = {
  invoice: ['invoice', 'payment'],
  product: ['product', 'stock'],
  stock: ['stock', 'product'],
};

/** A record's history is shown to anyone who can open that record (the
 * invoice editor's History panel works for staff too) — except logins and
 * company settings, which staff can't manage and so don't get to audit. */
const OWNER_ONLY_TYPES: ActivityEntityType[] = ['user', 'company'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** The activity log, newest first.
 *
 * Permissions: a query scoped to one record (`entityType` + `entityId`) only
 * needs a signed-in user, so any screen can show "who touched this" — the
 * full, unscoped log (or one filtered by person/type/date) is owner-only.
 * Never throws: failures come back as `{ error }` with an empty page. */
export async function listActivity(filters: ActivityFilters = {}): Promise<ActivityPage> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE)));
  const empty = { items: [], total: 0, page, pageSize };

  try {
    const types = filters.entityType ? (Array.isArray(filters.entityType) ? filters.entityType : [filters.entityType]) : [];
    const scoped = !!filters.entityId && types.length > 0;
    if (scoped && !types.some((t) => OWNER_ONLY_TYPES.includes(t))) await requireUser();
    else await requireOwner();

    const where: Prisma.ActivityLogWhereInput = {};
    if (scoped) {
      where.entityId = filters.entityId;
      where.entityType = { in: Array.from(new Set(types.flatMap((t) => RELATED_TYPES[t] ?? [t]))) };
    } else if (types.length) {
      where.entityType = { in: types };
    }
    if (filters.userId) where.userId = filters.userId;

    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.dateFrom && DATE_RE.test(filters.dateFrom)) createdAt.gte = istDayRangeUtc(filters.dateFrom).gte;
    if (filters.dateTo && DATE_RE.test(filters.dateTo)) createdAt.lt = istDayRangeUtc(filters.dateTo).lt;
    if (createdAt.gte || createdAt.lt) where.createdAt = createdAt;

    const [rows, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          createdAt: true,
          userId: true,
          user: { select: { name: true, email: true, phone: true } },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return {
      items: rows.map(({ user, createdAt, ...row }) => ({
        ...row,
        createdAt: createdAt.toISOString(),
        userName: user ? user.name || user.email || user.phone || 'Unnamed login' : 'System',
      })),
      total,
      page,
      pageSize,
    };
  } catch (err) {
    return { ...empty, ...toActionError(err) };
  }
}
