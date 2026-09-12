import type { NextAuthConfig } from 'next-auth';

const TENANT_ROUTE_PREFIXES = ['/dashboard', '/products', '/customers', '/invoices', '/reports', '/company', '/account'];

/** Edge-safe half of the NextAuth config (no Prisma, no bcrypt) — this is
 * the only part `middleware.ts` loads, since Credentials providers pull in
 * Node-only code that can't run in the Edge runtime. The full config in
 * `src/auth.ts` spreads this and adds the actual providers. */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const path = nextUrl.pathname;
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role;

      const isAdminRoute = path.startsWith('/admin') && path !== '/admin/login';
      const isTenantRoute = TENANT_ROUTE_PREFIXES.some((p) => path.startsWith(p));

      if (isAdminRoute) {
        if (!isLoggedIn || role !== 'SUPER_ADMIN') return Response.redirect(new URL('/admin/login', nextUrl));
        return true;
      }
      if (isTenantRoute) {
        if (!isLoggedIn || role === 'SUPER_ADMIN') return Response.redirect(new URL('/login', nextUrl));
        return true;
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.companyId = user.companyId;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.companyId = token.companyId as string | undefined;
        session.user.role = token.role as 'OWNER' | 'SUPER_ADMIN';
      }
      return session;
    },
  },
  providers: [], // populated in src/auth.ts — Credentials providers need Node (Prisma, bcrypt)
} satisfies NextAuthConfig;
