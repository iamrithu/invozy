// Server-only helpers shared by the /api/pdf/** document routes (credit
// notes, receipts, statements). Each route checks the session, mints a
// two-minute signed token for its /print/** page and hands the path to
// src/lib/invoice-pdf.ts renderPrintPage, which needs Chromium traced into
// that route's function (next.config.js outputFileTracingIncludes) and the
// memory for it (vercel.json).

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';
import { createSignedToken } from '@/lib/signed-token';
import { renderPrintPage } from '@/lib/invoice-pdf';

/** Long enough for a cold Chromium launch plus the page load; short
 * enough that a leaked print URL is useless almost at once. */
const PRINT_TOKEN_TTL_S = 120;

/** The signed-in user, or a 401 response to return as-is. */
export async function sessionOr401() {
  const user = await requireUser().catch(() => null);
  return user ? { user } : { response: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
}

/** Renders `/print/<page>/<id>?t=…[&extra]` to a PDF and answers with it —
 * as a download named `fileName`, or shown in the browser with `?inline=1`.
 * Any render failure becomes a readable 500 the download button can show. */
export async function renderDocumentPdf(
  req: NextRequest,
  doc: { kind: string; printPath: string; id: string; extraQuery?: Record<string, string>; fileName: string; footerLeft: string; footerRight?: string }
) {
  const token = createSignedToken(doc.kind, doc.id, PRINT_TOKEN_TTL_S);
  const query = new URLSearchParams({ t: token, ...doc.extraQuery });
  try {
    const pdf = await renderPrintPage(`${doc.printPath}/${encodeURIComponent(doc.id)}?${query}`, {
      origin: req.nextUrl.origin,
      footerLeft: doc.footerLeft,
      footerRight: doc.footerRight,
    });
    const disposition = req.nextUrl.searchParams.get('inline') === '1' ? 'inline' : 'attachment';
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${doc.fileName}"`,
        'Content-Length': String(pdf.length),
        // Per-user and changes whenever the document does.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error(`PDF generation failed for ${doc.printPath}/${doc.id}`, e);
    return NextResponse.json({ error: 'Could not prepare the PDF. Please try again.' }, { status: 500 });
  }
}

export function notFoundJson(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}
