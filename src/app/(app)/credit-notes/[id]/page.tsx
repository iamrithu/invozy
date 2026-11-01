import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileMinus } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { fmtInr, formatInvoiceDate } from '@/lib/gst';
import { loadLetterheadCompany } from '@/components/print/print-data';
import { loadCreditNoteDocument } from '@/components/credit-notes/credit-note-data';
import { CreditNoteDocument } from '@/components/credit-notes/credit-note-document';
import { CreditNoteActions } from '@/components/credit-notes/credit-note-actions';
import { ResponsiveSheetScale } from '@/components/invoices/responsive-sheet-scale';

export const dynamic = 'force-dynamic';

/** A saved credit note, read-only: what it did (set off against the
 * invoice, refund due, stock), the note itself exactly as it prints, and
 * Download / Delete. Credit notes aren't edited — delete and raise a new
 * one instead, so the numbered document the customer holds never changes. */
export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requireUser()]);
  const [note, company] = await Promise.all([loadCreditNoteDocument(id), loadLetterheadCompany()]);
  if (!note || !company) notFound();

  return (
    <div>
      <Link href="/credit-notes" className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-faint hover:text-ink">
        <ArrowLeft size={13} /> Credit notes
      </Link>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
            <FileMinus size={18} className="text-brand" /> <span className="font-mono">{note.number}</span>
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">
            {formatInvoiceDate(note.date)} · {note.customer.name} · against{' '}
            {note.invoice.id ? (
              <Link href={`/invoices/${note.invoice.id}`} className="font-mono text-ink-body underline-offset-2 hover:text-brand hover:underline">
                {note.invoice.number}
              </Link>
            ) : (
              <span className="font-mono">{note.invoice.number ?? '—'} (deleted)</span>
            )}
          </p>
        </div>
        <CreditNoteActions id={note.id} number={note.number} invoiceNumber={note.invoice.number} applied={note.applied} restock={note.restock} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Total credit" value={fmtInr(note.total)} />
        <Stat label="Set off against invoice" value={fmtInr(note.applied)} />
        <Stat label="Refund due to customer" value={fmtInr(note.refundDue)} tone={note.refundDue > 0.004 ? 'gold' : undefined} />
        <Stat label="Stock" value={note.restock ? 'Put back in stock' : 'Not restocked'} text />
      </div>
      {note.refundDue > 0.004 && (
        <p className="mb-4 rounded-lg2 bg-gold-soft px-3 py-2.5 text-[12.5px] text-ink-body">
          This credit was more than {note.invoice.number ?? 'the invoice'} still owed, so <b className="font-mono text-ink">{fmtInr(note.refundDue)}</b> is to be paid back to the
          customer.
        </p>
      )}

      <div className="rounded-xl2 border border-line bg-surface-alt p-3 shadow-card md:p-5">
        <ResponsiveSheetScale>
          <div className="bg-white p-7 shadow-card">
            <CreditNoteDocument note={note} company={company} />
          </div>
        </ResponsiveSheetScale>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, text }: { label: string; value: string; tone?: 'gold'; text?: boolean }) {
  return (
    <div className="rounded-lg2 border border-line bg-surface px-3 py-2.5 shadow-card">
      <div className="text-[11px] font-bold text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-[15px] font-bold ${text ? '' : 'font-mono'} ${tone === 'gold' ? 'text-gold' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
