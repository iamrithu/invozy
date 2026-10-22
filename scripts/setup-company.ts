/**
 * One-time setup for this single-company deployment: creates the Company
 * row (the one company every product, customer, and invoice belongs to) and
 * a login for it. There is no signup page — this script is the only way a
 * login gets created.
 *
 *   1. Fill in COMPANY below (only `name` and `state` are required — the rest
 *      can also be filled in later from the app's Company page).
 *   2. Run:
 *        npm run setup -- --email owner@yourcompany.com
 *      You'll be prompted for the password (or pass --password '...' /
 *      set SETUP_PASSWORD, e.g. in CI).
 *
 * Safe to re-run:
 *   - The company is created on the first run and left alone after that, so
 *     edits made in the app aren't overwritten — pass --update-company to
 *     push the values below onto the existing company instead.
 *   - A login email that already exists gets its password reset to the one
 *     given (this doubles as the "I'm locked out" recovery tool); a new
 *     email adds another login.
 */
import { parseArgs } from 'node:util';
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { COMPANY_ID } from '../src/lib/company-id';
import { currentIndianFY } from '../src/lib/gst';

// ── Fill these in ──────────────────────────────────────────────────────────
// `state` must be the full state name exactly as the app's state picker
// lists it (e.g. "Tamil Nadu", "Karnataka") — it's compared against each
// customer's state to decide CGST+SGST vs IGST. The company email is the
// login email passed on the command line.
const COMPANY: Omit<Prisma.CompanyCreateInput, 'id' | 'email' | 'invoiceFY'> & { invoiceFY?: string } = {
  name: '',
  state: '',
  district: null,
  address: null,
  pincode: null,
  phone: null,
  altPhone: null,
  domain: null,
  gstin: null,
  pan: null,
  fssaiNo: null,

  // Banking — printed on invoices
  bankName: null,
  bankAcc: null,
  ifsc: null,
  branch: null,
  upi: null,

  // Invoice numbering — numbers print as PREFIX/FY/0001
  invoicePrefix: 'INV',
  invoiceFY: currentIndianFY(),
  nextInvoiceNo: 1,

  terms: null,
};
// ───────────────────────────────────────────────────────────────────────────

const MIN_PASSWORD_LENGTH = 6; // same rule as the app's change-password form

const prisma = new PrismaClient();

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      password: { type: 'string' },
      'update-company': { type: 'boolean', default: false },
    },
  });

  const email = (values.email ?? process.env.SETUP_EMAIL ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail('Pass the login email: npm run setup -- --email owner@yourcompany.com');
  }
  if (!COMPANY.name.trim() || !COMPANY.state.trim()) {
    fail('Fill in COMPANY.name and COMPANY.state at the top of scripts/setup-company.ts first.');
  }

  let password = values.password ?? process.env.SETUP_PASSWORD;
  if (!password) {
    password = await promptHidden(`Password for ${email}: `);
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) fail('Passwords do not match.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

  const existingCompany = await prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { name: true } });
  const companyData = { ...COMPANY, invoiceFY: COMPANY.invoiceFY ?? currentIndianFY(), email };
  if (!existingCompany) {
    await prisma.company.create({ data: { id: COMPANY_ID, ...companyData } });
    console.log(`✔ Created company "${COMPANY.name}".`);
  } else if (values['update-company']) {
    await prisma.company.update({ where: { id: COMPANY_ID }, data: companyData });
    console.log(`✔ Updated company "${COMPANY.name}" from scripts/setup-company.ts.`);
  } else {
    console.log(`• Company "${existingCompany.name}" already exists — left unchanged (pass --update-company to overwrite it with the values in this script).`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existingUser = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  if (existingUser) {
    await prisma.user.update({ where: { id: existingUser.id }, data: { email, passwordHash } });
    console.log(`✔ Reset the password for ${email}.`);
  } else {
    await prisma.user.create({ data: { email, passwordHash } });
    console.log(`✔ Created login ${email}.`);
  }
  // Clears any lockout from earlier wrong-password attempts.
  await prisma.loginAttempt.deleteMany({ where: { identifier: email } });

  console.log('\nDone — start the app and log in at /login with that email and password.');
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) fail('No password given — pass --password or set SETUP_PASSWORD (stdin is not a terminal, so it cannot be prompted for).');
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = '';
    const done = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          done();
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          done();
          fail('Cancelled.');
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
