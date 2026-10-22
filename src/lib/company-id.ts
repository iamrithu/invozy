/** The one Company row's primary key. Must match `@default("main")` on
 * Company.id in prisma/schema.prisma — the setup script (scripts/
 * setup-company.ts) creates the row with it and src/lib/get-company.ts reads
 * it back by it. Kept in its own dependency-free module so the setup script
 * can import it without pulling in Next.js/auth code. */
export const COMPANY_ID = 'main';
