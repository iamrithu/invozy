import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { verifySignedToken } from '@/lib/signed-token';
import { loadPrintLetterhead } from '@/components/print/print-data';
import { PrintPageShell } from '@/components/print/print-page-shell';
import { loadCreditNoteDocument } from '@/components/credit-notes/credit-note-data';
import { CreditNoteDocument } from '@/components/credit-notes/credit-note-document';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Credit note', robots: { index: false, follow: false } };

/**
 * What the PDF renderer prints for /api/pdf/credit-notes/[id]: the credit
 * note alone, no app shell. Outside the (app) group and the session proxy
 * on purpose — the headless browser has no session — so access is a
 * short-lived signed 'print-credit-note' token for this one note in `?t=`;
 * anything else is a 404.
 */
export default async function PrintCreditNotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string | string[] }> }) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  if (verifySignedToken('print-credit-note', typeof t === 'string' ? t : null) !== id) notFound();

  const [note, company] = await Promise.all([loadCreditNoteDocument(id), loadPrintLetterhead()]);
  if (!note || !company) notFound();

  return (
    <PrintPageShell>
      <CreditNoteDocument note={note} company={company} />
    </PrintPageShell>
  );
}
