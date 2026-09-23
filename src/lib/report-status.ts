/** Shared status vocabulary for the Reports status-breakdown chart — kept
 * out of src/actions/reports.ts because a `'use server'` file may only
 * export async functions, not plain constants, and both the server action
 * (computing the breakdown) and the client chart component (coloring it)
 * need these same labels/colors. */
export const STATUS_ORDER = ['OVERDUE', 'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID'] as const;

export const STATUS_LABEL: Record<string, string> = {
  OVERDUE: 'Overdue',
  DRAFT: 'Draft',
  SENT: 'Sent',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
};

export const STATUS_COLOR: Record<string, string> = {
  OVERDUE: 'hsl(var(--red))',
  DRAFT: 'hsl(var(--ink-faint))',
  SENT: 'hsl(var(--gold))',
  PARTIALLY_PAID: 'hsl(var(--brand))',
  PAID: 'hsl(var(--green))',
};
