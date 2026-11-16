import { rootPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** For an uptime monitor (UptimeRobot, Better Stack…): 200 when the app and
 * its database answer, 503 when the database doesn't. Public, and returns
 * nothing about any company. */
export async function GET() {
  const started = Date.now();
  try {
    await rootPrisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: 'up', dbMs: Date.now() - started, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, db: 'down' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
