/** Cookie naming the company the platform admin is viewing read-only — its
 * own module so the edge-safe auth config can check for it without loading
 * Prisma. Verified (signature, expiry, admin credentials) in src/lib/view-as.ts. */
export const VIEW_AS_COOKIE = 'invozy_view_as';
