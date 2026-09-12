import { listInvoicesPage } from '@/actions/invoices';
import { InvoicesClient } from './invoices-client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const initialStatus = status ?? 'all';
  const initial = await listInvoicesPage({ status: initialStatus, page: 1, pageSize: PAGE_SIZE, sort: 'newest' });
  return <InvoicesClient initialData={initial} initialStatus={initialStatus} />
}
