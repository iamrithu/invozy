/**
 * One-time data migration: copies one company's data out of the old
 * multi-tenant Invozy database into this single-company ASB database.
 *
 *   SOURCE_DATABASE_URL='postgresql://…old db…' \
 *   SOURCE_AUTH_SECRET='…old AUTH_SECRET…' \
 *   npx tsx --env-file=.env scripts/migrate-from-invozy.ts --email owner@company.com
 *
 * - The source is only ever read, inside a single READ ONLY, REPEATABLE READ
 *   transaction — one consistent snapshot, and it cannot write.
 * - The target is written in one transaction: everything lands or nothing.
 * - Refuses to run if the target already has products, customers, or
 *   invoices, so it can't duplicate data on a second run.
 * - Products, price tiers, customers, invoices, items, and payments keep
 *   their original ids, so every relation between them carries over as-is.
 *   Each invoice's stored totals (see src/lib/invoice-totals.ts) are computed
 *   on the way in.
 * - If `npm run setup` already created the company here, its name and email
 *   are kept and every other profile field is taken from the source;
 *   otherwise the company is created from the source.
 * - Logins: an existing login with the same email keeps its password here
 *   (only its onboarding state is copied); a login that doesn't exist here
 *   yet is copied with its old password hash, so the old password works.
 * - Encrypted e-Invoice credentials are re-encrypted with this deployment's
 *   AUTH_SECRET when SOURCE_AUTH_SECRET can decrypt them; otherwise they're
 *   left empty and must be re-entered on the Company page.
 * - Not copied: password-reset tokens and login-lockout counters (both
 *   short-lived).
 */
import { parseArgs } from 'node:util';
import { PrismaClient, Prisma } from '@prisma/client';
import { COMPANY_ID } from '../src/lib/company-id';
import { computeInvoiceTotals, totalsColumns } from '../src/lib/invoice-totals';
import { decryptSecret, encryptSecret } from '../src/lib/secret';

type Row = Record<string, any>;

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/** Drops the multi-tenant column, which doesn't exist in this schema. */
function withoutCompanyId<T extends Row>({ companyId: _companyId, ...rest }: T) {
  return rest;
}

async function readSource(source: PrismaClient, email: string) {
  return source.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [owner] = await tx.$queryRaw<Row[]>`SELECT "companyId" FROM "User" WHERE lower(email) = lower(${email})`;
      if (!owner) fail(`No login with email ${email} in the source database.`);
      const cid = owner.companyId as string;
      const [company] = await tx.$queryRaw<Row[]>`SELECT * FROM "Company" WHERE id = ${cid}`;
      const users = await tx.$queryRaw<Row[]>`SELECT * FROM "User" WHERE "companyId" = ${cid}`;
      const products = await tx.$queryRaw<Row[]>`SELECT * FROM "Product" WHERE "companyId" = ${cid} ORDER BY id`;
      const tiers = await tx.$queryRaw<Row[]>`SELECT t.* FROM "ProductPriceTier" t JOIN "Product" p ON p.id = t."productId" WHERE p."companyId" = ${cid} ORDER BY t.id`;
      const customers = await tx.$queryRaw<Row[]>`SELECT * FROM "Customer" WHERE "companyId" = ${cid} ORDER BY id`;
      const invoices = await tx.$queryRaw<Row[]>`SELECT * FROM "Invoice" WHERE "companyId" = ${cid} ORDER BY number`;
      const items = await tx.$queryRaw<Row[]>`SELECT it.* FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId" WHERE i."companyId" = ${cid} ORDER BY it.id`;
      const payments = await tx.$queryRaw<Row[]>`SELECT p.* FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId" WHERE i."companyId" = ${cid} ORDER BY p.id`;
      // An invoice line pointing at another company's product (or an invoice
      // at another company's customer) would break once copied alone.
      const [cross] = await tx.$queryRaw<Row[]>`
        SELECT
          (SELECT count(*) FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId" JOIN "Product" p ON p.id = it."productId" WHERE i."companyId" = ${cid} AND p."companyId" <> ${cid})::int AS items,
          (SELECT count(*) FROM "Invoice" i JOIN "Customer" c ON c.id = i."customerId" WHERE i."companyId" = ${cid} AND c."companyId" <> ${cid})::int AS invoices`;
      if (cross.items || cross.invoices) fail(`Source data references another company (${cross.items} items, ${cross.invoices} invoices) — not migrating.`);
      return { company, users, products, tiers, customers, invoices, items, payments };
    },
    { isolationLevel: 'RepeatableRead', timeout: 120_000 }
  );
}

/** Re-encrypts one stored secret from the source deployment's key to this
 * one's. `undefined` = couldn't (left empty); null stays null. */
function reencrypt(enc: string | null, sourceSecret: string | undefined): string | null | undefined {
  if (!enc) return null;
  if (!sourceSecret) return undefined;
  try {
    return encryptSecret(decryptSecret(enc, sourceSecret));
  } catch {
    return undefined;
  }
}

async function main() {
  const { values } = parseArgs({ options: { email: { type: 'string' } } });
  const email = values.email?.trim().toLowerCase();
  if (!email) fail('Pass the login email of the company to migrate: --email owner@company.com');
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  if (!sourceUrl) fail('Set SOURCE_DATABASE_URL to the old database.');
  if (!process.env.AUTH_SECRET) fail("AUTH_SECRET isn't set — run with `npx tsx --env-file=.env …`.");
  if (sourceUrl === process.env.DATABASE_URL) fail('SOURCE_DATABASE_URL is the same database as DATABASE_URL.');

  const source = new PrismaClient({ datasourceUrl: sourceUrl });
  const target = new PrismaClient();
  try {
    const existing = await Promise.all([target.product.count(), target.customer.count(), target.invoice.count()]);
    if (existing.some((n) => n > 0)) {
      fail(`Target already has data (${existing[0]} products, ${existing[1]} customers, ${existing[2]} invoices) — not migrating on top of it.`);
    }

    console.log('Reading source…');
    const src = await readSource(source, email);
    console.log(
      `  ${src.products.length} products, ${src.tiers.length} price tiers, ${src.customers.length} customers, ` +
        `${src.invoices.length} invoices, ${src.items.length} invoice items, ${src.payments.length} payments`
    );

    // Company profile — keep the name/email chosen at setup if the row exists.
    const { id: _srcCompanyId, ...companyFields } = src.company;
    const nicPasswordEnc = reencrypt(src.company.nicPasswordEnc, process.env.SOURCE_AUTH_SECRET);
    const nicClientSecretEnc = reencrypt(src.company.nicClientSecretEnc, process.env.SOURCE_AUTH_SECRET);
    const warnings: string[] = [];
    if (nicPasswordEnc === undefined || nicClientSecretEnc === undefined) {
      warnings.push("Saved e-Invoice credentials couldn't be decrypted (set SOURCE_AUTH_SECRET) — re-enter them on the Company page.");
    }
    const targetCompany = await target.company.findUnique({ where: { id: COMPANY_ID }, select: { name: true, email: true } });
    const profile = {
      ...companyFields,
      ...(targetCompany ? { name: targetCompany.name, email: targetCompany.email } : {}),
      nicPasswordEnc: nicPasswordEnc ?? null,
      nicClientSecretEnc: nicClientSecretEnc ?? null,
    } as Prisma.CompanyUncheckedCreateInput;

    // Stored invoice totals, from the same computeTotals() the app uses.
    const customerState = new Map(src.customers.map((c) => [c.id as string, c.state as string]));
    const itemsByInvoice = new Map<string, Row[]>();
    for (const it of src.items) itemsByInvoice.set(it.invoiceId, [...(itemsByInvoice.get(it.invoiceId) ?? []), it]);
    const paidByInvoice = new Map<string, number>();
    for (const p of src.payments) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + Number(p.amount));
    const invoices = src.invoices.map((inv) => {
      const totals = computeInvoiceTotals(
        { ...(inv as any), items: itemsByInvoice.get(inv.id) ?? [], customer: { state: customerState.get(inv.customerId)! } },
        src.company.state
      );
      // Drafts there never took stock — see schema.prisma's Invoice.stockTaken.
      return { ...withoutCompanyId(inv), ...totalsColumns(totals), amountPaid: paidByInvoice.get(inv.id) ?? 0, stockTaken: inv.status !== 'DRAFT' } as Prisma.InvoiceCreateManyInput;
    });

    console.log('Writing target…');
    const loginNotes: string[] = [];
    await target.$transaction(
      async (tx) => {
        if (targetCompany) await tx.company.update({ where: { id: COMPANY_ID }, data: profile });
        else await tx.company.create({ data: { ...profile, id: COMPANY_ID } });

        for (const u of src.users) {
          const here = u.email ? await tx.user.findFirst({ where: { email: { equals: u.email, mode: 'insensitive' } }, select: { id: true } }) : null;
          if (here) {
            await tx.user.update({ where: { id: here.id }, data: { onboardedAt: u.onboardedAt } });
            loginNotes.push(`${u.email}: kept the password already set here`);
          } else {
            await tx.user.create({ data: { email: u.email, phone: u.phone, passwordHash: u.passwordHash, createdAt: u.createdAt, onboardedAt: u.onboardedAt } });
            loginNotes.push(`${u.email ?? u.phone}: copied with its old password`);
          }
        }

        await tx.product.createMany({ data: src.products.map(withoutCompanyId) as Prisma.ProductCreateManyInput[] });
        await tx.productPriceTier.createMany({ data: src.tiers as Prisma.ProductPriceTierCreateManyInput[] });
        await tx.customer.createMany({ data: src.customers.map(withoutCompanyId) as Prisma.CustomerCreateManyInput[] });
        await tx.invoice.createMany({ data: invoices });
        await tx.invoiceItem.createMany({ data: src.items as Prisma.InvoiceItemCreateManyInput[] });
        await tx.payment.createMany({ data: src.payments as Prisma.PaymentCreateManyInput[] });
      },
      { timeout: 120_000 }
    );

    // Verify against the source snapshot.
    const [products, tiers, customers, invoiceCount, items, payments, sums, company] = await Promise.all([
      target.product.count(),
      target.productPriceTier.count(),
      target.customer.count(),
      target.invoice.count(),
      target.invoiceItem.count(),
      target.payment.count(),
      target.invoice.aggregate({ _sum: { total: true, amountPaid: true } }),
      target.company.findUniqueOrThrow({ where: { id: COMPANY_ID }, select: { name: true, nextInvoiceNo: true, invoicePrefix: true, invoiceFY: true } }),
    ]);
    const expectedTotal = invoices.reduce((s, i) => s + Number(i.total), 0);
    const expectedPaid = src.payments.reduce((s, p) => s + Number(p.amount), 0);
    const checks: [string, unknown, unknown][] = [
      ['products', products, src.products.length],
      ['price tiers', tiers, src.tiers.length],
      ['customers', customers, src.customers.length],
      ['invoices', invoiceCount, src.invoices.length],
      ['invoice items', items, src.items.length],
      ['payments', payments, src.payments.length],
      ['billed total', Number(sums._sum.total ?? 0).toFixed(2), expectedTotal.toFixed(2)],
      ['paid total', Number(sums._sum.amountPaid ?? 0).toFixed(2), expectedPaid.toFixed(2)],
      ['next invoice no.', company.nextInvoiceNo, src.company.nextInvoiceNo],
    ];
    console.log('\nVerification (target vs source):');
    let ok = true;
    for (const [label, got, want] of checks) {
      const pass = got === want;
      ok &&= pass;
      console.log(`  ${pass ? '✔' : '✖'} ${label}: ${got}${pass ? '' : ` (expected ${want})`}`);
    }
    console.log(`\nCompany: "${company.name}" — next invoice ${company.invoicePrefix}/${company.invoiceFY}/${company.nextInvoiceNo}`);
    for (const n of loginNotes) console.log(`Login ${n}`);
    for (const w of warnings) console.log(`⚠ ${w}`);
    if (!ok) fail('Verification failed — see above.');
    console.log('\nDone.');
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
