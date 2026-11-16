import type { NextAuthConfig } from 'next-auth';
import type { AppRole } from '@/types/next-auth';
import { VIEW_AS_COOKIE } from '@/lib/view-as-cookie';

/** Pages reachable without a session — everything else the proxy matches
 * (see src/proxy.ts) requires one. */
const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/admin/login'];

/** Edge-safe half of the NextAuth config (no Prisma, no bcrypt) — this is
 * the only part `proxy.ts` loads. The full config in `src/auth.ts` spreads
 * this and adds the Credentials providers. */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl, cookies } }) {
      const path = nextUrl.pathname;
      const role = auth?.user?.role;
      const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

      // No "already signed in → skip /login" redirect here: this only sees
      // the cookie, not whether its user still exists, so it would bounce a
      // stale cookie between /login and the app forever. The login pages do
      // that redirect themselves after the real check.
      if (isPublic) return true;

      // The platform admin and company logins never share pages: /admin is
      // admin-only, and the admin (who has no company) can't open the app.
      if (path.startsWith('/admin')) {
        return role === 'SUPER_ADMIN' ? true : Response.redirect(new URL('/admin/login', nextUrl));
      }
      // …except read-only "view as company" (src/lib/view-as.ts): the cookie is
      // only a hint here; requireUser verifies it on every request.
      if (role === 'SUPER_ADMIN') return cookies.has(VIEW_AS_COOKIE) ? true : Response.redirect(new URL('/admin', nextUrl));
      if (!auth?.user || !auth.user.companyId) return Response.redirect(new URL('/login', nextUrl));
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.companyId = user.companyId;
        token.role = user.role;
        if (user.adminFp) token.adminFp = user.adminFp;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.companyId = token.companyId as string | undefined;
        session.user.role = token.role as AppRole;
        session.user.adminFp = token.adminFp as string | undefined;
      }
      return session;
    },
  },
  providers: [], // populated in src/auth.ts — the Credentials providers need Node (Prisma, bcrypt)
} satisfies NextAuthConfig;
