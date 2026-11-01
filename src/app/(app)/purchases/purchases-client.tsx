'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Paperclip, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentUser } from '@/components/current-user';
import { PurchasesNav } from '@/components/purchases/purchases-nav';
import { fmtPlainDate } from '@/components/inventory/stock-meta';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDeletePurchase, usePurchaseSummary, usePurchasesPage } from '@/hooks/use-purchases';
import type { PurchaseListItem } from '@/actions/purchases';
import type { SupplierOption } from '@/actions/suppliers';

const PAGE_SIZE = 20;

type Summary = { monthLabel: string; total: number; inputGst: number; count: number };

export function PurchasesClient({
  initialData,
  initialSummary,
  suppliers,
  currency,
}: {
  initialData: { items: PurchaseListItem[]; total: number };
  initialSummary: Summary;
  suppliers: SupplierOption[];
  currency: string;
}) {
  const router = useRouter();
  const { isOwner } = useCurrentUser();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [supplierId, setSupplierId] = useState('all');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseListItem | null>(null);
  const del = useDeletePurchase();

  useEffect(() => setPage(1), [search, supplierId]);

  const isSeed = search === '' && supplierId === 'all' && page === 1;
  const { data, isLoading, isFetching } = usePurchasesPage({ search, supplierId, page, pageSize: PAGE_SIZE }, isSeed ? initialData : undefined);
  const { data: summary = initialSummary } = usePurchaseSummary(initialSummary);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast.success('Purchase deleted — its stock was taken back out');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
            <ShoppingCart size={18} className="text-brand" /> Purchases
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Supplier bills. Each one adds its products to stock and records the input GST.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PurchasesNav />
          <Button asChild>
            <Link href="/purchases/new">
              <Plus size={13} /> New purchase
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <SummaryTile label={`Bought in ${summary.monthLabel}`} value={fmtInr(summary.total, currency)} />
        <SummaryTile label="Input GST" value={fmtInr(summary.inputGst, currency)} />
        <SummaryTile label="Bills" value={String(summary.count)} />
      </div>

      <div className={cn('mb-4 flex flex-wrap items-center gap-2.5 rounded-xl2 border border-line bg-surface p-3.5 shadow-card transition-opacity', isFetching && 'opacity-70')}>
        <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search bill no. or supplier…" className="h-8 max-w-[280px] text-[12.5px]" />
        {suppliers.length > 1 && (
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="h-8 w-[200px] text-[12px]" aria-label="Supplier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <SkeletonTable cols={6} />
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-line bg-surface py-14 text-center text-ink-faint shadow-card">
          <ShoppingCart size={32} />
          <p className="text-[13.5px] font-bold text-ink-soft">{search || supplierId !== 'all' ? 'No bills match.' : 'No purchases yet.'}</p>
          {!search && supplierId === 'all' && (
            <Button asChild size="sm">
              <Link href="/purchases/new">
                <Plus size={13} /> Record your first bill
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden shadow-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Bill no.</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/purchases/${p.id}`)}>
                    <TableCell className="whitespace-nowrap text-ink-soft">{fmtPlainDate(p.date)}</TableCell>
                    <TableCell className="font-mono font-bold text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        {p.billNo || '—'}
                        {p.attachmentCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 font-sans text-[11px] font-semibold text-ink-faint" title={`${p.attachmentCount} attached file${p.attachmentCount === 1 ? '' : 's'}`}>
                            <Paperclip size={12} />
                            {p.attachmentCount}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate font-semibold text-ink-body">{p.supplierName}</TableCell>
                    <TableCell className="text-right text-ink-soft">{p.itemCount}</TableCell>
                    <TableCell className="text-right font-mono text-ink-soft">{fmtInr(p.taxable, currency)}</TableCell>
                    <TableCell className="text-right font-mono text-ink-soft">{fmtInr(p.gst, currency)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-ink">{fmtInr(p.total, currency)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                          <Link href={`/purchases/${p.id}`} aria-label="Edit purchase">
                            <Pencil size={14} />
                          </Link>
                        </Button>
                        {isOwner && (
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-soft hover:text-red" aria-label="Delete purchase" onClick={() => setDeleteTarget(p)}>
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-2.5 md:hidden">
            {items.map((p) => (
              <Link key={p.id} href={`/purchases/${p.id}`} className="block rounded-xl2 border border-line bg-surface p-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-ink">{p.supplierName}</div>
                    <div className="text-[11px] text-ink-faint">
                      {fmtPlainDate(p.date)}
                      {p.billNo ? ` · Bill ${p.billNo}` : ''} · {p.itemCount} item{p.itemCount === 1 ? '' : 's'}
                      {p.attachmentCount > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5 align-middle">
                          · <Paperclip size={11} />
                          {p.attachmentCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[13px] font-bold text-ink">{fmtInr(p.total, currency)}</div>
                    <div className="text-[11px] text-ink-faint">GST {fmtInr(p.gst, currency)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this purchase"
        description={
          <>
            Delete {deleteTarget?.billNo ? <b className="font-bold text-ink">bill {deleteTarget.billNo}</b> : 'this bill'} from {deleteTarget?.supplierName}? Its products come
            back out of stock — if some of that stock has already been sold, the delete is refused.
          </>
        }
        confirmLabel="Delete purchase"
        pending={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl2 border border-line bg-surface px-3 py-2.5 shadow-card">
      <div className="truncate text-[11px] font-semibold text-ink-faint">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[15px] font-extrabold text-ink">{value}</div>
    </div>
  );
}
