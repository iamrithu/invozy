/**
 * Platform command line: creates a company with its first OWNER login — the
 * same thing /admin's "Add company" and the public /signup page do, for
 * bootstrapping a fresh database or scripting onboarding.
 *
 *   npm run create-company -- --name "Arctic Blocks Ice Co." --state "Tamil Nadu" --email owner@arcticblocks.in
 *
 * You'll be prompted for the password (or pass --password '...' / set
 * SETUP_PASSWORD, e.g. in CI). Optional: --phone, --owner-name.
 *
 * Recovery: if a login with that email already exists (in any company), its
 * password is reset instead and no company is created — the "owner is locked
 * out" tool when the admin panel isn't an option.
 *
 * `state` must be the full state name exactly as the app's state picker
 * lists it ("Tamil Nadu", "Karnataka") — it decides CGST+SGST vs IGST.
 */
import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { currentIndianFY } from '../src/lib/gst';

// Unscoped on purpose: this is platform code, so every create names its
// companyId explicitly (see the header of prisma/schema.prisma).
const prisma = new PrismaClient();
const MIN_PASSWORD_LENGTH = 6; // same rule as the app's change-password form

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      state: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      'owner-name': { type: 'string' },
      password: { type: 'string' },
    },
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Pass the owner login email: --email owner@yourcompany.com');

  let password = values.password ?? process.env.SETUP_PASSWORD;
  if (!password) {
    password = await promptHidden(`Password for ${email}: `);
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) fail('Passwords do not match.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const passwordHash = await bcrypt.hash(password, 10);

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, company: { select: { name: true } } },
  });
  if (existingUser) {
    await prisma.user.update({ where: { id: existingUser.id }, data: { passwordHash, active: true } });
    await prisma.loginAttempt.deleteMany({ where: { identifier: email } });
    console.log(`✔ ${email} already exists (company "${existingUser.company.name}") — its password was reset and the login switched on.`);
    return;
  }

  const name = values.name?.trim();
  const state = values.state?.trim();
  if (!name || !state) fail('A new company needs --name "Company name" and --state "Tamil Nadu".');
  const phone = values.phone ? values.phone.replace(/[\s-]/g, '') : null;

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({ data: { name, state, email, invoiceFY: currentIndianFY() } });
    await tx.user.create({ data: { companyId: created.id, email, phone, name: values['owner-name']?.trim() || null, passwordHash, role: 'OWNER' } });
    return created;
  });
  console.log(`✔ Created company "${company.name}" (${company.id}) with owner login ${email}.`);
  console.log('\nDone — log in at /login with that email and password.');
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
