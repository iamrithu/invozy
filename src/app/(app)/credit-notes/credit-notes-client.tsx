'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileMinus, Filter, MoreHorizontal, Plus, Receipt, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonTable } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DateRangeFilter } from '@/components/filters/date-range-filter';
import { PdfDownloadButton } from '@/components/print/pdf-download-button';
import { DeleteCreditNoteDialog } from '@/components/credit-notes/delete-credit-note-dialog';
import { pdfFileName } from '@/components/print/format';
import { useCurrentUser } from '@/components/current-user';
import { fmtInr, formatInvoiceDate } from '@/lib/gst';
import { customerDisplayName } from '@/lib/customer';
import { resolveDateRange, type DateFilterMode } from '@/lib/dates';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCreditNotesPage, useDeleteCreditNote } from '@/hooks/use-credit-notes';
import type { CreditNoteListRow } from '@/actions/credit-notes';

const PAGE_SIZE = 10;

export function CreditNotesClient({ initialData, initialDate }: { initialData: { items: CreditNoteListRow[]; total: number }; initialDate: string }) {
  const router = useRouter();
  const { isOwner } = useCurrentUser();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(1);
  const [dateMode, setDateMode] = useState<DateFilterMode>('all');
  const [customFrom, setCustomFrom] = useState(initialDate);
  const [customTo, setCustomTo] = useState(initialDate);
  const { from: dateFrom, to: dateTo } = resolveDateRange(dateMode, customFrom, customTo);
  const [deleteTarget, setDeleteTarget] = useState<CreditNoteListRow | null>(null);
  const deleteNote = useDeleteCreditNote();

  useEffect(() => setPage(1), [search, dateMode, customFrom, customTo]);

  const filtered = search !== '' || dateMode !== 'all';
  const isDefaultParams = !filtered && page === 1;
  const { data, isFetching, isLoading } = useCreditNotesPage({ search, dateFrom, dateTo, page, pageSize: PAGE_SIZE }, isDefaultParams ? initialData : undefined);
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteNote.mutateAsync(deleteTarget.id);
      toast.success(`Credit note ${deleteTarget.number} deleted`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not delete this credit note');
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
            <FileMinus size={18} className="text-brand" /> Credit notes
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Goods taken back and price corrections. Each one lowers what its invoice&apos;s customer owes.</p>
        </div>
        <Button asChild>
          <Link href="/credit-notes/new">
            <Plus size={13} /> New credit note
          </Link>
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl2 border border-line bg-surface p-3 shadow-card">
        <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search credit note #, invoice # or customer…" className="max-w-xs flex-shrink-0" />
        <DateRangeFilter mode={dateMode} onModeChange={setDateMode} from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />
      </div>

      {isLoading ? (
        <SkeletonTable cols={7} />
      ) : total === 0 ? (
        filtered ? (
          <div className="rounded-xl2 border border-line bg-surface p-12 text-center text-ink-faint shadow-card">
            <Filter size={22} className="mx-auto mb-2" />
            <p className="text-[13px]">No credit notes match these filters.</p>
          </div>
        ) : (
          <EmptyState />
        )
      ) : (
        <div className={`rounded-xl2 border border-line bg-surface shadow-card transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Credit note #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((cn) => (
                <TableRow
                  key={cn.id}
                  onClick={() => router.push(`/credit-notes/${cn.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget === e.target && router.push(`/credit-notes/${cn.id}`)}
                  tabIndex={0}
                  className="cursor-pointer"
                >
                  <TableCell className="whitespace-nowrap font-mono font-bold text-ink">{cn.number}</TableCell>
                  <TableCell className="whitespace-nowrap text-ink-faint">{formatInvoiceDate(cn.date)}</TableCell>
                  <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {cn.invoiceId ? (
                      <Link href={`/invoices/${cn.invoiceId}`} className="font-mono text-ink-body underline-offset-2 hover:text-brand hover:underline">
                        {cn.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="font-mono text-ink-faint" title="This invoice has been deleted">
                        {cn.invoiceNumber ?? '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-body">{customerDisplayName(cn.customer)}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-ink-soft" title={cn.reason ?? undefined}>
                    {cn.reason ?? '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono font-bold text-ink-soft">
                    {fmtInr(cn.total)}
                    {cn.open > 0.004 && <div className="text-[10.5px] font-semibold text-gold">{fmtInr(cn.open)} still owed</div>}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      <PdfDownloadButton iconOnly href={`/api/pdf/credit-notes/${cn.id}`} fileName={pdfFileName(cn.number)} label={`Download ${cn.number} PDF`} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" size="icon" variant="ghost" aria-label={`More actions for ${cn.number}`} className="h-8 w-8">
                            <MoreHorizontal size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[190px]">
                          <DropdownMenuItem onClick={() => router.push(`/credit-notes/${cn.id}`)}>
                            <Eye size={14} /> Open
                          </DropdownMenuItem>
                          {cn.invoiceId && (
                            <DropdownMenuItem onClick={() => router.push(`/invoices/${cn.invoiceId}`)}>
                              <Receipt size={14} /> Open invoice
                            </DropdownMenuItem>
                          )}
                          {isOwner && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red focus:text-red" onClick={() => setDeleteTarget(cn)}>
                                <Trash2 size={14} /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <DeleteCreditNoteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        number={deleteTarget?.number}
        invoiceNumber={deleteTarget?.invoiceNumber}
        applied={deleteTarget?.applied}
        restock={deleteTarget?.restock}
        pending={deleteNote.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl2 border border-line bg-surface px-6 py-12 text-center shadow-card">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
        <FileMinus size={20} />
      </span>
      <h2 className="mt-3 text-[15px] font-extrabold text-ink">No credit notes yet</h2>
      <p className="mx-auto mt-1.5 max-w-[440px] text-[12.5px] leading-relaxed text-ink-soft">
        A credit note is raised against an invoice when goods come back or a price needs correcting. Open the invoice and choose{' '}
        <b className="text-ink">⋯ → Credit note / return</b>, or pick the invoice here.
      </p>
      <Button asChild className="mt-4">
        <Link href="/credit-notes/new">
          <Plus size={13} /> Pick an invoice
        </Link>
      </Button>
    </div>
  );
}
