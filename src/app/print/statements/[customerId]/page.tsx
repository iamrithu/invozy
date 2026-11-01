import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { verifySignedToken } from '@/lib/signed-token';
import { loadPrintLetterhead } from '@/components/print/print-data';
import { buildCustomerStatement } from '@/components/print/statement-data';
import { PrintPageShell } from '@/components/print/print-page-shell';
import { StatementDocument } from '@/components/print/statement-document';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Statement of account', robots: { index: false, follow: false } };

type Search = { t?: string | string[]; from?: string | string[]; to?: string | string[] };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);

/**
 * What the PDF renderer prints for /api/pdf/statements/[customerId]: one
 * customer's statement of account for `?from=&to=` (IST `YYYY-MM-DD`,
 * either may be left out). Signed 'print-statement' token for this
 * customer in `?t=` instead of a session (see
 * src/app/print/credit-notes/[id]/page.tsx).
 */
export default async function PrintStatementPage({ params, searchParams }: { params: Promise<{ customerId: string }>; searchParams: Promise<Search> }) {
  const [{ customerId }, query] = await Promise.all([params, searchParams]);
  if (verifySignedToken('print-statement', one(query.t)) !== customerId) notFound();

  const [statement, company] = await Promise.all([buildCustomerStatement(customerId, one(query.from), one(query.to)), loadPrintLetterhead()]);
  if (!statement || !company) notFound();

  return (
    <PrintPageShell>
      <StatementDocument statement={statement} company={company} />
    </PrintPageShell>
  );
}
