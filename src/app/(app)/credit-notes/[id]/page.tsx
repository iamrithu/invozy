import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAppSettings } from '@/lib/settings';
import { ArrowLeft, FileMinus } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { fmtInr, formatInvoiceDate } from '@/lib/gst';
import { loadLetterheadCompany } from '@/components/print/print-data';
import { loadCreditNoteDocument } from '@/components/credit-notes/credit-note-data';
import { CreditNoteDocument } from '@/components/credit-notes/credit-note-document';
import { CreditNoteActions } from '@/components/credit-notes/credit-note-actions';
import { CreditSettlement } from '@/components/credit-notes/credit-settlement';
import { ResponsiveSheetScale } from '@/components/invoices/responsive-sheet-scale';

export const dynamic = 'force-dynamic';

/** A saved credit note: where its money went (set off against its
 * invoice, adjusted on others, refunded, still open) with the actions that
 * settle the rest, the note itself exactly as it prints, and Download /
 * Delete. Credit notes aren't edited — delete and raise a new one instead,
 * so the numbered document the customer holds never changes. */
export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requireUser()]);
  const [note, company, settings] = await Promise.all([loadCreditNoteDocument(id), loadLetterheadCompany(), getAppSettings()]);
  if (!note || !company) notFound();

  return (
    <div>
      <Link href="/credit-notes" className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-faint hover:text-ink">
        <ArrowLeft size={13} /> Credit notes
      </Link>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[16px] sm:text-[17px] font-extrabold text-ink">
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

      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <Stat label="Total credit" value={fmtInr(note.total)} />
        <Stat label={`Set off on ${note.invoice.number ?? 'invoice'}`} value={fmtInr(note.applied)} />
        <Stat label="Adjusted on other invoices" value={fmtInr(note.adjusted)} />
        <Stat label="Refunded" value={fmtInr(note.refunded)} />
        <Stat label="Open credit" value={fmtInr(note.open)} tone={note.open > 0.004 ? 'gold' : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="order-2 min-w-0 rounded-xl2 border border-line bg-surface-alt p-3 shadow-card md:p-5 lg:order-1">
          <ResponsiveSheetScale>
            <div className="bg-white p-7 shadow-card">
              <div className={`doc-rows-${settings.pdfItemRows}`}>
                <CreditNoteDocument note={note} company={company} />
              </div>
            </div>
          </ResponsiveSheetScale>
        </div>
        <div className="order-1 min-w-0 lg:order-2">
          <CreditSettlement
            note={{
              id: note.id,
              number: note.number,
              customerName: note.customer.name,
              customerPhone: note.customer.phone,
              open: note.open,
              adjustments: note.adjustments,
              refunds: note.refunds,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'gold' }) {
  return (
    <div className={`rounded-lg2 border px-3 py-2.5 shadow-card ${tone === 'gold' ? 'border-gold bg-gold-soft' : 'border-line bg-surface'}`}>
      <div className="truncate text-[11px] font-bold text-ink-faint">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-bold text-ink">{value}</div>
    </div>
  );
}
