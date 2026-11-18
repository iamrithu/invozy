import { prisma } from './prisma';
import { currentCompanyId } from './tenant';
import { sendEmail, type EmailAttachment } from './email';
import { buildDailyDigest, renderDailyDigest } from './daily-digest';
import { getUserFlag } from './settings';
import { buildMonthlyReportPdf } from './monthly-report-pdf';
import { isModuleEnabled } from './modules';
import { effectiveDisabledModules, ENTITLEMENT_SELECT, subscriptionView } from './entitlements';
import { buildBackup, storeBackup } from './backup';
import { deleteUploadedImage, sweepOrphanUploads } from './uploads';
import { APP_NAME } from './brand';

// What the scheduled jobs do for ONE company. Each runs inside
// runWithTenant(companyId) in its own function invocation (src/app/api/cron/
// company), dispatched by the per-job cron routes — so one company's work can
// never see another's, and the platform's time limit applies per company,
// not to all companies together.

export type CompanyJob = 'daily' | 'backup';

async function ownerEmails(): Promise<{ id: string; email: string }[]> {
  const owners = await prisma.user.findMany({ where: { role: 'OWNER', active: true, email: { not: null } }, select: { id: true, email: true } });
  return owners.filter((o): o is { id: string; email: string } => !!o.email);
}

/** The 8 AM summary to the company's owners (unless switched off), with last
 * month's report on the 1st when Reports is on — then any subscription
 * reminder that's due. */
export async function runDailyJob(origin: string, today: string): Promise<{ sent: number; failed: number; reminder: string | null }> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: await currentCompanyId() }, select: { name: true, ...ENTITLEMENT_SELECT } });
  const owners = await ownerEmails();
  const recipients: string[] = [];
  for (const o of owners) if (await getUserFlag(o.id, 'dailyDigest', true)) recipients.push(o.email);

  let sent = 0;
  let failed = 0;
  if (recipients.length) {
    const digest = await buildDailyDigest();
    const attachments: EmailAttachment[] = [];
    if (today.endsWith('-01') && isModuleEnabled(effectiveDisabledModules(company), 'reports')) {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 1);
      const month = d.toISOString().slice(0, 7);
      try {
        const slug = company.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';
        attachments.push({ filename: `${slug}-report-${month}.pdf`, content: await buildMonthlyReportPdf(month, { origin }), contentType: 'application/pdf' });
      } catch (e) {
        console.error('Monthly report PDF for the daily email failed', e);
      }
    }
    const { subject, html } = renderDailyDigest(digest, origin, attachments.length > 0);
    const results = await Promise.allSettled(recipients.map((to) => sendEmail(to, subject, html, attachments)));
    failed = results.filter((r) => r.status === 'rejected').length;
    sent = recipients.length - failed;
  }
  const reminder = await sendSubscriptionReminder(company, owners.map((o) => o.email), origin);
  await housekeeping().catch((e) => console.error('Daily housekeeping failed', e));
  return { sent, failed, reminder };
}

const TRASH_DAYS = 30;

/** Tidy-ups that run once a day per company. Categories that have sat in
 * Trash for 30 days are deleted for good (only when no product uses them),
 * which frees their slugs. Their images go too. */
async function housekeeping(): Promise<void> {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 3600 * 1000);
  const stale = await prisma.category.findMany({
    where: { deletedAt: { lt: cutoff }, products: { none: {} } },
    select: { id: true, imageUrl: true },
  });
  if (!stale.length) return;
  await prisma.category.deleteMany({ where: { id: { in: stale.map((c) => c.id) } } });
  await Promise.all(stale.filter((c) => c.imageUrl).map((c) => deleteUploadedImage(c.imageUrl!)));
}

const REMINDER_KEY = 'billing.lastReminder';

/** One email per milestone per period: trial/plan ending in ≤ 3 days, and
 * ended. Remembered in AppSetting so a daily run never repeats it. */
async function sendSubscriptionReminder(
  company: { name: string } & Parameters<typeof subscriptionView>[0],
  to: string[],
  origin: string
): Promise<string | null> {
  const view = subscriptionView(company);
  if (!view.endsAt || !to.length) return null;
  const trial = company.subscriptionStatus === 'TRIALING';
  const milestone =
    (view.state === 'trialing' || view.state === 'active') && view.daysLeft !== null && view.daysLeft <= 3
      ? `${trial ? 'trial' : 'plan'}-ending`
      : view.state === 'grace' || view.state === 'locked'
        ? `${trial ? 'trial' : 'plan'}-ended`
        : null;
  if (!milestone) return null;
  const marker = `${milestone}:${view.endsAt.toISOString()}`;
  const companyId = await currentCompanyId();
  const last = await prisma.appSetting.findUnique({ where: { companyId_key: { companyId, key: REMINDER_KEY } } });
  if (last?.value === marker) return null;

  const when = view.endsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  const subject = milestone.endsWith('ending')
    ? `${trial ? 'Your free trial' : `Your ${view.plan.label} plan`} ends on ${when}`
    : `${trial ? 'Your free trial' : `Your ${view.plan.label} plan`} has ended`;
  const body = milestone.endsWith('ending')
    ? `<p>${trial ? `${company.name}'s free trial of ${APP_NAME}` : `${company.name}'s ${view.plan.label} plan`} ends on <b>${when}</b>.</p><p><a href="${origin}/billing">Choose a plan</a> to keep billing without a break.</p>`
    : `<p>${trial ? `${company.name}'s free trial` : `${company.name}'s ${view.plan.label} plan`} ended on ${when}. Everything you entered is safe, but new invoices will stop${view.graceEndsAt ? ` on ${view.graceEndsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}` : ''}.</p><p><a href="${origin}/billing">Renew now</a>.</p>`;
  await Promise.allSettled(to.map((email) => sendEmail(email, subject, body)));
  await prisma.appSetting.upsert({ where: { companyId_key: { companyId, key: REMINDER_KEY } }, create: { key: REMINDER_KEY, value: marker }, update: { value: marker } });
  return milestone;
}

/** The nightly backup of this company, then sweeping its bill attachments
 * uploaded over a day ago that never made it onto a bill. */
export async function runBackupJob(): Promise<{ where: string; bytes: number; pruned: number; sweptUploads: number }> {
  const { gz, createdAt } = await buildBackup();
  const stored = await storeBackup(gz, createdAt);
  let sweptUploads = 0;
  try {
    const onBills = await prisma.purchaseAttachment.findMany({ select: { url: true } });
    sweptUploads = await sweepOrphanUploads(await currentCompanyId(), 'purchases', new Set(onBills.map((a) => a.url)), 24 * 60 * 60 * 1000);
  } catch (e) {
    console.error('Sweeping unsaved purchase uploads failed', e);
  }
  return { where: stored.where, bytes: stored.bytes, pruned: stored.pruned, sweptUploads };
}
