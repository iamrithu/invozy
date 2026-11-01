import { requireOwner } from '@/lib/session';
import { istDayRangeUtc } from '@/lib/dates';

// Shared by every /api/export/* route handler. Exports are owner-only: a
// spreadsheet of every customer's phone number and balance, or a full
// backup, is exactly the kind of thing that shouldn't walk out with a
// staff login.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `null` when allowed, otherwise the error response to return. Route
 * handlers are reached directly (not through the proxy), so the session
 * check has to happen here. */
export async function ownerGate(): Promise<Response | null> {
  try {
    await requireOwner();
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Not signed in.';
    const status = /owner/i.test(message) ? 403 : 401;
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export type ExportRange = {
  from?: string;
  to?: string;
  /** Prisma `where` fragment for a date column, IST calendar days, inclusive. */
  dateWhere?: { gte?: Date; lt?: Date };
};

/** `?from=YYYY-MM-DD&to=YYYY-MM-DD`, both optional (open-ended), anything
 * malformed ignored rather than erroring — same semantics as the Reports
 * page's date filter (src/lib/dates.ts resolveDateRange). */
export function parseRange(url: URL): ExportRange {
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const f = from && DATE.test(from) ? from : undefined;
  const t = to && DATE.test(to) ? to : undefined;
  if (!f && !t) return {};
  return {
    from: f,
    to: t,
    dateWhere: {
      ...(f ? { gte: istDayRangeUtc(f).gte } : {}),
      ...(t ? { lt: istDayRangeUtc(t).lt } : {}),
    },
  };
}
