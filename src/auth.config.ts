import type { NextAuthConfig } from 'next-auth';

/** Pages reachable without a session — everything else the proxy matches
 * (see src/proxy.ts) requires one. */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

/** Edge-safe half of the NextAuth config (no Prisma, no bcrypt) — this is
 * the only part `proxy.ts` loads. The full config in `src/auth.ts` spreads
 * this and adds the Credentials provider. */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p));

      // No "already signed in → skip /login" redirect here: this only sees
      // the cookie, not whether its user still exists, so it would bounce a
      // stale cookie between /login and the app forever. The login page does
      // that redirect itself after the real check (src/app/login/page.tsx).
      if (isPublic) return true;
      if (!isLoggedIn) return Response.redirect(new URL('/login', nextUrl));
      return true;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
  providers: [], // populated in src/auth.ts — the Credentials provider needs Node (Prisma, bcrypt)
} satisfies NextAuthConfig;
