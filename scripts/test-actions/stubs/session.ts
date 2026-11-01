// The signed-in user is whoever run.ts sets as `__TEST_USER`.
type TestUser = { id: string; role: 'OWNER' | 'STAFF' };

export async function requireUser() {
  const u = (globalThis as { __TEST_USER?: TestUser }).__TEST_USER;
  if (!u) throw new Error('Not signed in.');
  return { id: u.id, email: null, phone: null, name: 'Test', role: u.role, active: true, onboardedAt: null };
}

export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== 'OWNER') throw new Error('Only the owner can do this. Ask the owner to make this change.');
  return user;
}
