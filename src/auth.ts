import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { assertNotLockedOut, clearFailedLogins, recordFailedLogin } from '@/lib/login-rate-limit';

// Surfaced to the client as `result.code` (see the .code assignment below) —
// deliberately generic per NextAuth's own guidance: it must not hint at
// whether the account exists, only that this identifier is rate-limited.
class TooManyAttempts extends CredentialsSignin {
  code = 'too-many-attempts';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  providers: [
    // Tenant business owners — logged in by email or phone, whichever they signed up with.
    Credentials({
      id: 'tenant',
      name: 'Tenant',
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

        const user = await prisma.user.findFirst({
          where: {
            role: 'OWNER',
            OR: [{ email: identifier }, { phone: identifier }],
          },
        });
        const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
        if (!user || !valid) {
          await recordFailedLogin(identifier);
          return null;
        }
        await clearFailedLogins(identifier);

        return { id: user.id, companyId: user.companyId, role: user.role, email: user.email ?? undefined };
      },
    }),
    // The platform owner — a single fixed identity from env vars, never a DB row.
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

        try {
          await assertNotLockedOut(email);
        } catch {
          throw new TooManyAttempts();
        }

        const valid = email.toLowerCase() === adminEmail.toLowerCase() && (await bcrypt.compare(password, adminHash));
        if (!valid) {
          await recordFailedLogin(email);
          return null;
        }
        await clearFailedLogins(email);

        return { id: 'super-admin', role: 'SUPER_ADMIN', email: adminEmail };
      },
    }),
  ],
});
