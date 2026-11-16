import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

// No Prisma, no bcrypt — only the `authorized` callback runs here, which does
// the actual redirect logic (see src/auth.config.ts). The session is a
// signed JWT cookie, so this never touches the database.
const { auth } = NextAuth(authConfig);

export function proxy(req: Parameters<typeof auth>[0]) {
  return (auth as any)(req);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/products/:path*',
    '/customers/:path*',
    '/invoices/:path*',
    '/reports/:path*',
    '/company/:path*',
    '/account/:path*',
    '/inventory/:path*',
    '/purchases/:path*',
    '/suppliers/:path*',
    '/credit-notes/:path*',
    '/activity/:path*',
    '/team/:path*',
    // The platform admin panel (role-checked in src/auth.config.ts; the
    // admin layout and every admin action re-check it).
    '/admin/:path*',
    // Not /print/* — the headless PDF renderer reaches those with a signed
    // token instead of a session cookie (src/lib/signed-token.ts).
  ],
};
