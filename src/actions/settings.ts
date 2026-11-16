'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner } from '@/lib/session';
import { toActionError } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { fmtInr } from '@/lib/gst';
import { setAppSetting, type PdfItemRows } from '@/lib/settings';

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

/** How product rows are separated on CLEAN-style documents. Every stored
 * invoice PDF is drawn in the old style, so Company.updatedAt (part of each
 * PDF's cache key, see src/lib/invoice-pdf.ts) is bumped to rebuild them. */
export async function setPdfItemRows(style: PdfItemRows): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();
    if (!['none', 'lines', 'zebra'].includes(style)) return { error: 'Pick one of the row styles.' };
    await setAppSetting('pdfItemRows', style);
    await prisma.$executeRaw`UPDATE "Company" SET "updatedAt" = NOW()`;
    await logActivity({ userId: user.id, action: 'company.pdf-rows', entityType: 'company', summary: `PDF product rows: ${style === 'none' ? 'column lines only' : style === 'lines' ? 'a line between rows' : 'light shading on alternate rows'}` });
    revalidatePath('/company');
    return {};
  } catch (err) {
    return toActionError(err);
  }
}
