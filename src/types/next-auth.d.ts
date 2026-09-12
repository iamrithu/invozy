import type { DefaultSession } from 'next-auth';

type AppRole = 'OWNER' | 'SUPER_ADMIN';

declare module 'next-auth' {
  interface User {
    id?: string;
    companyId?: string;
    role: AppRole;
  }

  interface Session {
    user: {
      id: string;
      companyId?: string;
      role: AppRole;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    companyId?: string;
    role?: AppRole;
  }
}
