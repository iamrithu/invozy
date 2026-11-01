/** Server actions that the UI awaits return `{ error }` instead of throwing:
 * Next.js production builds replace a thrown action error's message with a
 * generic "An error occurred in the Server Components render" text, so the
 * real reason ("This customer has invoices…") would never reach the user.
 * See node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md.
 *
 * Kept free of server-only imports so client hooks can use `unwrap`. */
export type ActionResult<T extends object = {}> = { error?: string } & Partial<T>;

/** Turns any thrown value inside a server action into a user-facing
 * message. Errors we throw on purpose (plain `Error` with a sentence for a
 * message) pass through; anything that looks like an internal failure
 * (Prisma, network) is logged and replaced with a generic retry message. */
export function toActionError(err: unknown): { error: string } {
  if (err instanceof Error && (err as any).userFacing !== false && !/prisma|invalid `|connection|ECONN|timeout/i.test(err.message)) {
    return { error: err.message };
  }
  console.error(err);
  return { error: 'Something went wrong. Please try again.' };
}

/** Client side: rethrows a returned `{ error }` so React Query's onError /
 * a try/catch around mutateAsync sees it like any other failure. */
export function unwrap<T extends { error?: string } | void>(res: T): T {
  if (res && typeof res === 'object' && 'error' in res && res.error) throw new Error(res.error);
  return res;
}
