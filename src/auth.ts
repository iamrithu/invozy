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
    // The company's logins — created by `npm run setup` (scripts/setup-company.ts),
    // signed in by email or phone.
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

        const user = await prisma.user.findFirst({
          where: { OR: [{ email: { equals: identifier, mode: 'insensitive' } }, { phone: identifier }] },
        });
        const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
        if (!user || !valid) {
          await recordFailedLogin(identifier);
          return null;
        }
        await clearFailedLogins(identifier);

        return { id: user.id, email: user.email ?? undefined };
      },
    }),
  ],
});
