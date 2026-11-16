import type { DefaultSession } from 'next-auth';

/** A company login's role (UserRole in the schema), or the platform admin —
 * who exists only in env vars and has no company. */
export type AppRole = 'OWNER' | 'STAFF' | 'SUPER_ADMIN';

declare module 'next-auth' {
  interface User {
    id?: string;
    companyId?: string;
    role?: AppRole;
    /** Platform admin only — see src/lib/admin-fingerprint.ts. */
    adminFp?: string;
  }

  interface Session {
    user: {
      id: string;
      companyId?: string;
      role: AppRole;
      adminFp?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    companyId?: string;
    role?: AppRole;
    adminFp?: string;
  }
}
