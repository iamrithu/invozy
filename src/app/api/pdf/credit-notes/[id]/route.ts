import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pdfFileName } from '@/components/print/format';
import { notFoundJson, renderDocumentPdf, sessionOr401 } from '@/components/print/pdf-route';

export const dynamic = 'force-dynamic';
// A cold Chromium launch plus the render — same budget as the invoice PDF
// route (renders themselves are capped at 20s in src/lib/invoice-pdf.ts).
export const maxDuration = 60;

/** A credit note's PDF ("CN-26-27-0001.pdf"), rendered from
 * /print/credit-notes/[id]. Signed-in users only; `?inline=1` shows it in
 * the browser instead of downloading. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session.response) return session.response;

  const { id } = await params;
  const note = await prisma.creditNote.findUnique({ where: { id }, select: { number: true } });
  if (!note) return notFoundJson('Credit note not found');

  return renderDocumentPdf(req, {
    kind: 'print-credit-note',
    printPath: '/print/credit-notes',
    id,
    fileName: pdfFileName(note.number),
    footerLeft: 'This is a computer-generated credit note.',
    footerRight: note.number,
  });
}
