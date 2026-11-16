import { rootPrisma } from './prisma';
import { requestIp } from './request-ip';

// The platform admin's audit trail (/admin/audit): every action that changes
// a company, a login, a subscription, or opens a company's data. Written with
// rootPrisma (the scoped client refuses this table) and never throws — a
// logging hiccup must not undo the admin's actual change.

export async function logPlatformAction(entry: { action: string; companyId?: string | null; targetId?: string | null; summary: string; actor?: string }) {
  try {
    let actor = entry.actor;
    if (!actor) {
      const { auth } = await import('@/auth');
      actor = (await auth())?.user?.email ?? 'system';
    }
    await rootPrisma.platformAuditLog.create({
      data: {
        actor,
        action: entry.action,
        companyId: entry.companyId ?? null,
        targetId: entry.targetId ?? null,
        summary: entry.summary.slice(0, 500),
        ip: (await requestIp()) || null,
      },
    });
  } catch (err) {
    console.error('platform audit log failed', err);
  }
}
