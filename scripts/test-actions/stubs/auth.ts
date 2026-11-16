// Stand-in for next-auth's auth(): the session is whoever run.ts sets as
// `__TEST_USER`, carrying its companyId exactly as the real JWT does — so
// src/lib/tenant.ts resolves the company the same way it does in the app.
type TestUser = { id: string; role: 'OWNER' | 'STAFF'; companyId: string };

export async function auth() {
  const u = (globalThis as { __TEST_USER?: TestUser }).__TEST_USER;
  return u ? { user: { id: u.id, role: u.role, companyId: u.companyId } } : null;
}
