import { prisma } from '@/lib/prisma';
import { sendEmail, type EmailAttachment } from '@/lib/email';
import { buildDailyDigest, renderDailyDigest } from '@/lib/daily-digest';
import { getUserFlag } from '@/lib/settings';
import { todayIst } from '@/lib/dates';
import { buildMonthlyReportPdf } from '@/lib/monthly-report-pdf';
import { cronUnauthorized, isCronAuthorized } from '../cron-auth';

export const dynamic = 'force-dynamic';
// On the 1st the monthly report PDF is rendered in headless Chromium.
export const maxDuration = 60;

/**
 * The 8 AM summary (vercel.json cron, 02:30 UTC = 08:00 IST): yesterday's
 * billing and collections, the month against its target, and everything
 * that needs attention — sent to every active owner login with an email
 * that hasn't switched it off (the bell's "Daily email" switch). On the 1st
 * of the month, last month's report PDF rides along as an attachment.
 * Without SMTP configured, src/lib/email.ts logs the message instead.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorized();
  const origin = new URL(req.url).origin;
  try {
    const owners = await prisma.user.findMany({ where: { role: 'OWNER', active: true, email: { not: null } }, select: { id: true, email: true } });
    const recipients: string[] = [];
    for (const o of owners) if (o.email && (await getUserFlag(o.id, 'dailyDigest', true))) recipients.push(o.email);
    if (!recipients.length) return Response.json({ sent: 0, reason: 'No owner has the daily summary on.' }, { headers: { 'Cache-Control': 'no-store' } });

    const digest = await buildDailyDigest();
    const attachments: EmailAttachment[] = [];
    const today = todayIst();
    if (today.endsWith('-01')) {
      // Last month's report — a failure here never blocks the summary.
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 1);
      const month = d.toISOString().slice(0, 7);
      try {
        attachments.push({ filename: `ASB-report-${month}.pdf`, content: await buildMonthlyReportPdf(month, { origin }), contentType: 'application/pdf' });
      } catch (e) {
        console.error('Monthly report PDF for the daily email failed', e);
      }
    }
    const { subject, html } = renderDailyDigest(digest, origin, attachments.length > 0);
    const results = await Promise.allSettled(recipients.map((to) => sendEmail(to, subject, html, attachments)));
    const failed = results.filter((r) => r.status === 'rejected');
    for (const f of failed) console.error('Daily summary email failed', (f as PromiseRejectedResult).reason);
    return Response.json({ sent: recipients.length - failed.length, failed: failed.length, attachments: attachments.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Daily summary failed', e);
    return Response.json({ error: 'Daily summary failed — see the function logs.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
