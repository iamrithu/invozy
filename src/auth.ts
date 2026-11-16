import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/auth.config';
import { rootPrisma } from '@/lib/prisma';
import { assertNotLockedOut, clearAdminFailedLogins, clearFailedLogins, recordFailedLogin } from '@/lib/login-rate-limit';
import { isEmailIdentifier, normalizePhone } from '@/lib/login-identifiers';
import { adminFingerprint } from '@/lib/admin-fingerprint';

// Surfaced to the client as `result.code` (see the .code assignment below) —
// deliberately generic per NextAuth's own guidance: it must not hint at
// whether the account exists, only that this identifier is rate-limited.
class TooManyAttempts extends CredentialsSignin {
  code = 'too-many-attempts';
}

/** The company was suspended from /admin — said plainly, since the person
 * signing in has already proved they hold a valid login. */
class CompanySuspended extends CredentialsSignin {
  code = 'company-suspended';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  providers: [
    // A company's logins (owners and staff), signed in by email or phone.
    // Sign-in doesn't ask which company — email/phone are unique across the
    // whole platform, so the login itself says which company it belongs to.
    Credentials({
      id: 'credentials',
      name: 'Credentials',
      credentials: { identifier: {}, password: {} },
      async authorize(credentials) {
        const identifier = String(credentials?.identifier ?? '').trim();
        const password = String(credentials?.password ?? '');
        if (!identifier || !password) return null;

        try {
          await assertNotLockedOut(identifier);
        } catch {
          throw new TooManyAttempts();
        }

        // An email (has "@") only ever matches an email, a phone only a phone —
        // so a value saved in one field can't shadow someone else's login.
        // Phones are stored without spaces/dashes (see src/actions/team.ts), so
        // "98400 12345" and "9840012345" both find the same login (the exact
        // form also matches, for phones saved before that rule).
        const user = await rootPrisma.user.findFirst({
          where: isEmailIdentifier(identifier)
            ? { email: { equals: identifier, mode: 'insensitive' } }
            : { OR: [{ phone: normalizePhone(identifier) }, { phone: identifier }] },
          include: { company: { select: { active: true } } },
          orderBy: { createdAt: 'asc' },
        });
        const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
        // A login the owner switched off fails exactly like a wrong password —
        // no hint that the account exists.
        if (!user || !valid || !user.active) {
          await recordFailedLogin(identifier);
          return null;
        }
        await clearFailedLogins(identifier);
        if (!user.company.active) throw new CompanySuspended();

        return { id: user.id, email: user.email ?? undefined, companyId: user.companyId, role: user.role };
      },
    }),
    // The platform owner — a single fixed identity from env vars, never a DB
    // row, with no company of its own. Reaches only /admin.
    Credentials({
      id: 'admin',
      name: 'Admin',
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').trim();
        const password = String(credentials?.password ?? '');
        const adminEmail = process.env.ADMIN_EMAIL;
        // Some hosts' env-var UIs (e.g. Vercel's dashboard) don't unescape a
        // shell-escaped "\$" the way Next's local .env loader does, so a hash
        // copy-pasted verbatim from .env can arrive here with literal
        // backslashes and never match. A real bcrypt hash never contains a
        // backslash, so stripping them is always safe.
        const adminHash = process.env.ADMIN_PASSWORD_HASH?.replace(/\\\$/g, '$');
        if (!email || !password || !adminEmail || !adminHash) return null;

        // The admin's own throttle namespace — no company login shares it.
        try {
          await assertNotLockedOut(email, 'admin');
        } catch {
          throw new TooManyAttempts();
        }

        const valid = email.toLowerCase() === adminEmail.toLowerCase() && (await bcrypt.compare(password, adminHash));
        if (!valid) {
          await recordFailedLogin(email, 'admin');
          return null;
        }
        await clearAdminFailedLogins(email);

        // Ties the session to the current admin credentials: changing
        // ADMIN_EMAIL or ADMIN_PASSWORD_HASH ends every admin session
        // (checked by requireSuperAdmin in src/lib/session.ts).
        return { id: 'super-admin', role: 'SUPER_ADMIN', email: adminEmail, adminFp: adminFingerprint() };
      },
    }),
  ],
});
