import { prisma } from './prisma';

export type ActivityEntry = {
  userId?: string | null;
  action: string;
  entityType: 'invoice' | 'customer' | 'product' | 'stock' | 'payment' | 'credit-note' | 'purchase' | 'supplier' | 'company' | 'user';
  entityId?: string | null;
  summary: string;
};

/** Appends one row to the activity log. Call it after the change itself has
 * committed — never inside a transaction, where a failed insert would abort
 * the whole transaction. Never throws: a logging failure must not fail the
 * user's actual change. */
export async function logActivity(entry: ActivityEntry) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary.slice(0, 500),
      },
    });
  } catch (err) {
    console.error('activity log failed', err);
  }
}
