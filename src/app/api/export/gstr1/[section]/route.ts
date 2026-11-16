import type { NextRequest } from 'next/server';
import { CSV_BOM, csvHeaders, csvRow, exportFileName } from '@/lib/csv';
import { buildGstr1Section, isGstr1Section } from '@/lib/gstr1';
import { ownerGate, parseRange } from '../../export-utils';
import { loadGstr1Data } from '../gstr1-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One GSTR-1 section as a CSV in the GST offline tool's layout —
 * `/api/export/gstr1/<section>?from=&to=` (sections and rules in
 * src/lib/gstr1.ts). Owner only, like every export. A month's invoices fit
 * comfortably in memory, so this builds the file whole rather than
 * streaming it.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const denied = await ownerGate();
  if (denied) return denied;
  const { section } = await params;
  if (!isGstr1Section(section)) return Response.json({ error: 'Unknown GSTR-1 section.' }, { status: 404 });

  const range = parseRange(req.nextUrl);
  try {
    const sheet = buildGstr1Section(section, await loadGstr1Data(range));
    const body = CSV_BOM + csvRow(sheet.header) + sheet.rows.map(csvRow).join('');
    return new Response(body, { headers: csvHeaders(exportFileName(`gstr1-${section}`, range, 'csv')) });
  } catch (e) {
    console.error(`GSTR-1 ${section} export failed`, e);
    return Response.json({ error: 'Could not prepare the GSTR-1 file. Please try again.' }, { status: 500 });
  }
}
