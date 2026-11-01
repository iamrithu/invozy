import { listCreditNotesPage } from '@/actions/credit-notes';
import { todayIst } from '@/lib/dates';
import { CreditNotesClient } from './credit-notes-client';

export const dynamic = 'force-dynamic';

// Must match PAGE_SIZE in credit-notes-client.tsx — this is only the
// initial SSR fetch; a mismatch would flash one page size, then the other.
const PAGE_SIZE = 10;

export default async function CreditNotesPage() {
  const initial = await listCreditNotesPage({ page: 1, pageSize: PAGE_SIZE });
  return <CreditNotesClient initialData={initial} initialDate={todayIst()} />;
}
