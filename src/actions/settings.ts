'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner } from '@/lib/session';
import { toActionError } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { fmtInr } from '@/lib/gst';
import { setAppSetting, type PdfItemRows } from '@/lib/settings';
import { normalizePdfLayout, type PdfLayout } from '@/lib/pdf-layout';
import type { InvoiceTemplateName } from '@/lib/invoice-template';

/** The dashboard's monthly sales target (net sales, ₹). Null clears it. */
export async function setMonthlySalesTarget(amount: number | null): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();
    const value = amount == null || !Number.isFinite(amount) || amount <= 0 ? null : Math.round(amount);
    await setAppSetting('monthlySalesTarget', value);
    await logActivity({ userId: user.id, action: 'company.target', entityType: 'company', summary: value ? `Set the monthly sales target to ${fmtInr(value)}` : 'Cleared the monthly sales target' });
    revalidatePath('/dashboard');
    return {};
  } catch (err) {
    return toActionError(err);
  }
}

const TEMPLATE_NAMES: readonly InvoiceTemplateName[] = ['MODERN', 'CLASSIC', 'CLEAN'];
const ROW_STYLES: readonly PdfItemRows[] = ['none', 'lines', 'zebra'];
const ROW_STYLE_LABEL: Record<PdfItemRows, string> = { none: 'column lines only', lines: 'a line between rows', zebra: 'light shading' };

/** Company → Invoice template & PDF layout, saved together: the template,
 * how product rows are separated, and the layout (margins, row spacing,
 * rows per page, page furniture — clamped by src/lib/pdf-layout.ts). Also
 * moves Company.updatedAt, part of every stored invoice PDF's cache key
 * (src/lib/invoice-pdf.ts), so saved PDFs redraw the next time they open. */
export async function savePdfSettings(input: {
  invoiceTemplate: InvoiceTemplateName;
  pdfItemRows: PdfItemRows;
  layout: Partial<PdfLayout>;
}): Promise<{ error?: string; layout?: PdfLayout }> {
  try {
    const user = await requireOwner();
    if (!TEMPLATE_NAMES.includes(input.invoiceTemplate)) return { error: 'Pick one of the invoice templates.' };
    if (!ROW_STYLES.includes(input.pdfItemRows)) return { error: 'Pick one of the row styles.' };
    const layout = normalizePdfLayout(input.layout);
    // Settings first: if the settings table isn't there yet, nothing changes.
    await setAppSetting('pdfItemRows', input.pdfItemRows);
    await setAppSetting('pdfLayout', layout);
    await prisma.company.updateMany({ data: { invoiceTemplate: input.invoiceTemplate, updatedAt: new Date() } });
    const l = layout;
    await logActivity({
      userId: user.id,
      action: 'company.pdf-layout',
      entityType: 'company',
      summary: `Invoice PDF: ${input.invoiceTemplate.charAt(0) + input.invoiceTemplate.slice(1).toLowerCase()} template, ${ROW_STYLE_LABEL[input.pdfItemRows]}, margins ${l.marginTop}/${l.marginRight}/${l.marginBottom}/${l.marginLeft} mm, ${l.rowSpacing} rows, up to ${l.maxRowsPerPage} rows a page (${l.maxRowsWithTotals} with totals), logo ${l.logoScale}%`,
    });
    revalidatePath('/company');
    revalidatePath('/invoices', 'layout');
    return { layout };
  } catch (err) {
    return toActionError(err);
  }
}
