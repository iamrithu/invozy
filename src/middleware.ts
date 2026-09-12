import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

// Edge-safe: no Prisma, no bcrypt — only the `authorized` callback runs here,
// which does the actual redirect logic (see src/auth.config.ts).
const { auth } = NextAuth(authConfig);

export function middleware(req: Parameters<typeof auth>[0]) {
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
    '/admin/:path*',
  ],
};
