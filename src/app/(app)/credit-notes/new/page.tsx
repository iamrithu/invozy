import Link from 'next/link';
import { AlertTriangle, ArrowLeft, FileMinus } from 'lucide-react';
import { getCreditNoteSource } from '@/actions/credit-notes';
import { todayIst } from '@/lib/dates';
import { CreditNoteForm } from '@/components/credit-notes/credit-note-form';
import { InvoicePicker } from '@/components/credit-notes/invoice-picker';

export const dynamic = 'force-dynamic';

/** `/credit-notes/new?invoice=<id>` — the credit-note form for that
 * invoice (the invoice editor's ⋯ menu links here). Without `?invoice`,
 * or when that invoice can't take one (a draft, or deleted), it starts
 * with picking the invoice instead. */
export default async function NewCreditNotePage({ searchParams }: { searchParams: Promise<{ invoice?: string | string[] }> }) {
  const { invoice } = await searchParams;
  const invoiceId = typeof invoice === 'string' && invoice ? invoice : null;
  const res = invoiceId ? await getCreditNoteSource(invoiceId) : null;
  if (res?.source) return <CreditNoteForm key={res.source.id} source={res.source} today={todayIst()} />;

  return (
    <div className="mx-auto max-w-[720px]">
      <Link href="/credit-notes" className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-faint hover:text-ink">
        <ArrowLeft size={13} /> Credit notes
      </Link>
      <h1 className="flex items-center gap-2 text-[16px] sm:text-[17px] font-extrabold text-ink">
        <FileMinus size={18} className="text-brand" /> New credit note
      </h1>
      <p className="mb-4 mt-1 text-[12px] text-ink-faint">Which invoice is it for? Goods returned or a price corrected are always credited against the invoice they were billed on.</p>
      {res?.error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg2 bg-red-soft px-3 py-2.5 text-[12.5px] text-ink-body">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-red" />
          {res.error}
        </p>
      )}
      <InvoicePicker />
    </div>
  );
}
