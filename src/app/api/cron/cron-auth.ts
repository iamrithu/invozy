import { timingSafeEqual } from 'node:crypto';

/** Vercel Cron calls each scheduled path with a plain GET and, when the
 * project has a CRON_SECRET environment variable, an
 * `Authorization: Bearer <CRON_SECRET>` header — that header is the only
 * thing separating the nightly backup from any stranger hitting the URL.
 * With no CRON_SECRET configured every call is refused (fail closed), never
 * waved through. Constant-time compare so the secret can't be guessed a
 * character at a time from response timings. */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function cronUnauthorized(): Response {
  return Response.json(
    { error: process.env.CRON_SECRET ? 'Not allowed' : 'CRON_SECRET is not set on this deployment.' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  );
}
