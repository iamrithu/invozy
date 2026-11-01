import { getDraftsHoldingStock, getReorderSuggestions, listInventoryPage, type InventoryStatusFilter } from '@/actions/inventory';
import { getCompany } from '@/lib/get-company';
import { InventoryClient } from './inventory-client';

export const dynamic = 'force-dynamic';

// Must match PAGE_SIZE in inventory-client.tsx — this is only the initial
// SSR fetch; a mismatch would show one page size first and another after.
const PAGE_SIZE = 20;

const STATUSES: InventoryStatusFilter[] = ['all', 'in', 'low', 'out', 'untracked', 'reorder', 'expiring'];

/** `?status=low` (the dashboard's Low stock card) or `?status=expiring`
 * opens the list on that chip. */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = STATUSES.find((s) => s === raw) ?? 'all';
  const [initial, drafts, reorder, company] = await Promise.all([
    listInventoryPage({ status, page: 1, pageSize: PAGE_SIZE }),
    getDraftsHoldingStock(),
    getReorderSuggestions(),
    getCompany(),
  ]);
  // Keyed so arriving with a different ?status while already here starts
  // the list over on that chip instead of keeping the old filters.
  return <InventoryClient key={status} initialData={initial} initialStatus={status} drafts={drafts} reorder={reorder} companyName={company.name} />;
}
