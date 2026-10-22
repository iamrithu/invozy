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
  ],
};
