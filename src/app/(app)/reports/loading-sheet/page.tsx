import type { Metadata } from 'next';
import { getLoadingSheet } from '@/actions/reports';
import { getCompany } from '@/lib/get-company';
import { todayIst } from '@/lib/dates';
import { normalizeLoadingParams } from './loading-sheet-data';
import { LoadingSheetClient } from './loading-sheet-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Loading sheet' };

/** /reports/loading-sheet?date=YYYY-MM-DD&group=vehicle|route&drafts=1 —
 * the day's load and drop lists per vehicle or route. The URL is the
 * source of truth for the first render (so a bookmarked or shared link
 * opens the same sheet); after that the client keeps it in sync. */
export default async function LoadingSheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);
  const today = todayIst();
  const params = normalizeLoadingParams({ date: str(sp.date), group: str(sp.group), drafts: str(sp.drafts) }, today);
  const [company, sheet] = await Promise.all([getCompany(), getLoadingSheet(params)]);
  return <LoadingSheetClient initial={sheet} today={today} currency={company.currency} />;
}
