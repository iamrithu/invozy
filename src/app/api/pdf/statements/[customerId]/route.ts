import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { customerDisplayName } from '@/lib/customer';
import { pdfFileName } from '@/components/print/format';
import { isIsoDate } from '@/components/print/statement-data';
import { notFoundJson, renderDocumentPdf, sessionOr401 } from '@/components/print/pdf-route';

export const dynamic = 'force-dynamic';
// A cold Chromium launch plus the render — same budget as the invoice PDF
// route (renders themselves are capped at 20s in src/lib/invoice-pdf.ts).
export const maxDuration = 60;

/** A customer's statement of account as a PDF, for `?from=&to=` (IST
 * `YYYY-MM-DD`, inclusive, either may be left out), rendered from
 * /print/statements/[customerId]. Signed-in users only; `?inline=1` shows
 * it in the browser instead of downloading. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await sessionOr401();
  if (session.response) return session.response;

  const { customerId } = await params;
  const from = req.nextUrl.searchParams.get('from') || null;
  const to = req.nextUrl.searchParams.get('to') || null;
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return NextResponse.json({ error: 'Pick valid dates for the statement period.' }, { status: 400 });
  if (from && to && from > to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400 });

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, shopName: true } });
  if (!customer) return notFoundJson('Customer not found');

  const name = customerDisplayName(customer);
  // The footer is drawn without the page's web fonts, so only plain ASCII
  // is safe there (a name in Tamil would print as empty boxes).
  const asciiName = name.replace(/[^\x20-\x7E]/g, '').trim();
  return renderDocumentPdf(req, {
    kind: 'print-statement',
    printPath: '/print/statements',
    id: customerId,
    extraQuery: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
    fileName: statementFileName(name, from, to),
    footerLeft: asciiName ? `Statement of account - ${asciiName}` : 'Statement of account',
  });
}

/** "Statement-Iswarya-Bakery-2026-04-01-to-2026-10-31.pdf". */
function statementFileName(name: string, from: string | null, to: string | null) {
  const period = from && to ? `${from}-to-${to}` : from ? `from-${from}` : to ? `to-${to}` : 'all';
  return pdfFileName(`Statement-${name.trim().replace(/\s+/g, '-')}-${period}`).replace(/-{2,}/g, '-');
}
