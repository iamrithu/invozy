import { prisma, rootPrisma } from '@/lib/prisma';
import { sendEmail, type EmailAttachment } from '@/lib/email';
import { buildDailyDigest, renderDailyDigest } from '@/lib/daily-digest';
import { getUserFlag } from '@/lib/settings';
import { todayIst } from '@/lib/dates';
import { buildMonthlyReportPdf } from '@/lib/monthly-report-pdf';
import { currentCompanyId, runWithTenant } from '@/lib/tenant';
import { isModuleEnabled } from '@/lib/modules';
import { cronUnauthorized, isCronAuthorized } from '../cron-auth';
import { configuredSiteOrigin } from '@/lib/site-origin';

export const dynamic = 'force-dynamic';
// On the 1st the monthly report PDF is rendered in headless Chromium, once
// per company that has the summary on.
export const maxDuration = 60;

/**
 * The 8 AM summary (vercel.json cron, 02:30 UTC = 08:00 IST), per company:
 * yesterday's billing and collections, the month against its target, and
 * everything that needs attention — sent to each of that company's active
 * owner logins with an email that hasn't switched it off (the bell's "Daily
 * email" switch). On the 1st of the month, last month's report PDF rides
 * along as an attachment. Every company's digest is built inside its own
 * scope, so one company's figures can never reach another's owners. Without
 * SMTP configured, src/lib/email.ts logs the message instead.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorized();
  const origin = (configuredSiteOrigin() ?? new URL(req.url).origin);
  const today = todayIst();
  // The only cross-company read: which companies to run for.
  const companies = await rootPrisma.company.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  let sent = 0;
  let failed = 0;
  const skipped: string[] = [];

  for (const company of companies) {
    try {
      const result = await runWithTenant(company.id, () => sendCompanyDigest(company.name, origin, today));
      sent += result.sent;
      failed += result.failed;
      if (!result.sent && !result.failed) skipped.push(company.id);
    } catch (e) {
      failed++;
      console.error(`Daily summary failed for company ${company.id}`, e);
    }
  }
  return Response.json({ companies: companies.length, sent, failed, skipped: skipped.length }, { status: failed ? 500 : 200, headers: { 'Cache-Control': 'no-store' } });
}

async function sendCompanyDigest(companyName: string, origin: string, today: string): Promise<{ sent: number; failed: number }> {
  const owners = await prisma.user.findMany({ where: { role: 'OWNER', active: true, email: { not: null } }, select: { id: true, email: true } });
  const recipients: string[] = [];
  for (const o of owners) if (o.email && (await getUserFlag(o.id, 'dailyDigest', true))) recipients.push(o.email);
  if (!recipients.length) return { sent: 0, failed: 0 };

  const digest = await buildDailyDigest();
  const attachments: EmailAttachment[] = [];
  const reportsOn = await prisma.company
    .findUnique({ where: { id: await currentCompanyId() }, select: { disabledModules: true } })
    .then((c) => isModuleEnabled(c?.disabledModules, 'reports'));
  if (today.endsWith('-01') && reportsOn) {
    // Last month's report — a failure here never blocks the summary.
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    const month = d.toISOString().slice(0, 7);
    try {
      const slug = companyName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';
      attachments.push({ filename: `${slug}-report-${month}.pdf`, content: await buildMonthlyReportPdf(month, { origin }), contentType: 'application/pdf' });
    } catch (e) {
      console.error('Monthly report PDF for the daily email failed', e);
    }
  }
  const { subject, html } = renderDailyDigest(digest, origin, attachments.length > 0);
  const results = await Promise.allSettled(recipients.map((to) => sendEmail(to, subject, html, attachments)));
  const bad = results.filter((r) => r.status === 'rejected');
  for (const f of bad) console.error('Daily summary email failed', (f as PromiseRejectedResult).reason);
  return { sent: recipients.length - bad.length, failed: bad.length };
}
