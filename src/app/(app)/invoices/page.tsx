import { listInvoicesPage } from '@/actions/invoices';
import { todayIst } from '@/lib/dates';
import { InvoicesClient } from './invoices-client';

export const dynamic = 'force-dynamic';

// Must match PAGE_SIZE in invoices-client.tsx — this is only the initial
// SSR fetch, but if it doesn't match, the client shows this page size on
// first load and silently switches to its own on the next fetch.
const PAGE_SIZE = 10;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const initialStatus = status ?? 'all';
  // Defaults to today (IST) — matches invoices-client.tsx's own default
  // date-filter state, so the SSR-seeded page and the client's first fetch
  // agree instead of flashing "all invoices" then narrowing to "today".
  const today = todayIst();
  const initial = await listInvoicesPage({ status: initialStatus, page: 1, pageSize: PAGE_SIZE, sort: 'newest', dateFrom: today, dateTo: today });
  return <InvoicesClient initialData={initial} initialStatus={initialStatus} initialDate={today} />
}
