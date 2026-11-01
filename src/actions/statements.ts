'use server';

import { requireUser } from '@/lib/session';
import { toActionError } from '@/lib/action-result';
import { buildCustomerStatement, isIsoDate, type CustomerStatement } from '@/components/print/statement-data';

/** A customer's statement of account between two IST calendar dates
 * (`YYYY-MM-DD`, inclusive; either may be left open): opening balance,
 * invoices / payments / credit notes in date order with a running balance,
 * totals and closing balance. Drafts are excluded throughout. The PDF
 * version is /api/pdf/statements/[customerId]?from&to. */
export async function getCustomerStatement(
  customerId: string,
  from?: string | null,
  to?: string | null
): Promise<{ error?: string; statement?: CustomerStatement }> {
  try {
    await requireUser();
    if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return { error: 'Pick valid dates for the statement period.' };
    if (from && to && from > to) return { error: 'The start date is after the end date.' };
    const statement = await buildCustomerStatement(customerId, from, to);
    if (!statement) return { error: 'Customer not found.' };
    return { statement };
  } catch (e) {
    return toActionError(e);
  }
}
