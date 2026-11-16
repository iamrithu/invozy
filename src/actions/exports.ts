'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { currentCompanyId } from '@/lib/tenant';
import { requireOwner } from '@/lib/session';
import { toActionError, type ActionResult } from '@/lib/action-result';
import { logActivity } from '@/lib/activity';
import { resolveTallyLedgers, type TallyLedgers } from '@/lib/tally';

// Settings behind the Reports page's Export menu. The exports themselves
// are route handlers under src/app/api/export (they stream files, which a
// server action can't); only the Tally ledger names live here.

/** The ledger names the Tally export posts to — saved values over the
 * defaults (src/lib/tally.ts). */
export async function getTallyLedgers(): Promise<ActionResult<{ ledgers: TallyLedgers }>> {
  try {
    await requireOwner();
    const company = await prisma.company.findUnique({ where: { id: await currentCompanyId() }, select: { tallyLedgers: true } });
    return { ledgers: resolveTallyLedgers(company?.tallyLedgers) };
  } catch (err) {
    return toActionError(err);
  }
}

const ledgerName = z
  .string()
  .trim()
  .max(80, 'Ledger names can be at most 80 characters.')
  // Tally rejects ledger names with these; better to say so here than have
  // the import fail on the accountant's machine.
  .refine((v) => !/[<>"]/.test(v), 'Ledger names can’t contain < > or ".');

const TallyLedgersSchema = z.object({
  sales: ledgerName,
  cgst: ledgerName,
  sgst: ledgerName,
  igst: ledgerName,
  roundOff: ledgerName,
  salesReturn: ledgerName,
});

/** Saves the Tally ledger names (blank = back to the default). Written
 * with raw SQL on purpose: Prisma's @updatedAt would otherwise bump
 * Company.updatedAt, which is part of every stored invoice PDF's cache key
 * (src/lib/invoice-pdf.ts) — renaming a Tally ledger shouldn't make every
 * invoice PDF rebuild. */
export async function updateTallyLedgers(input: TallyLedgers): Promise<ActionResult<{ ledgers: TallyLedgers }>> {
  try {
    const user = await requireOwner();
    const parsed = TallyLedgersSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the ledger names.' };
    const ledgers = resolveTallyLedgers(parsed.data);
    await prisma.$executeRaw`UPDATE "Company" SET "tallyLedgers" = ${JSON.stringify(ledgers)}::jsonb WHERE id = ${await currentCompanyId()} /* tenant-scoped: the company's own row */`;
    await logActivity({ userId: user.id, action: 'company.tally-ledgers', entityType: 'company', entityId: await currentCompanyId(), summary: 'Updated Tally ledger names' });
    return { ledgers };
  } catch (err) {
    return toActionError(err);
  }
}
