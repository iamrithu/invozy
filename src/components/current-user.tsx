'use client';

import { createContext, useContext, useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';

export type UserRoleName = 'OWNER' | 'STAFF';

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRoleName;
  /** Shorthand for `role === 'OWNER'` — what most callers actually ask. */
  isOwner: boolean;
};

/** Least-privileged stand-in for anything rendered outside the app shell
 * (e.g. a shared component reused on a /print page): owner-only controls
 * stay hidden rather than the page crashing. The server actions behind
 * those controls check the role again regardless (requireOwner), so this
 * only ever decides what's *shown*. */
const SIGNED_OUT: CurrentUser = { id: '', name: null, email: null, phone: null, role: 'STAFF', isOwner: false };

const CurrentUserContext = createContext<CurrentUser>(SIGNED_OUT);

/** Makes the signed-in login available to every client component under the
 * app shell — mounted once by src/app/(app)/layout.tsx with the user it
 * already loaded via requireUser(), so reading it costs no extra request.
 * After a change to the user's own name/role, a router refresh (or
 * `refresh()` from next/cache in the action) re-renders the layout and
 * this value with it. */
export function CurrentUserProvider({
  user,
  children,
}: {
  user: { id: string; name: string | null; email: string | null; phone: string | null; role: UserRoleName };
  children: React.ReactNode;
}) {
  const { id, name, email, phone, role } = user;
  const value = useMemo<CurrentUser>(() => ({ id, name, email, phone, role, isOwner: role === 'OWNER' }), [id, name, email, phone, role]);
  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

/** The signed-in login. Use `isOwner` to hide owner-only controls (deletes,
 * company settings, logins, activity log) from staff — e.g.
 * `{isOwner && <DeleteButton />}`. Hiding is for tidiness only; the action
 * itself must still call requireOwner(). */
export function useCurrentUser(): CurrentUser {
  return useContext(CurrentUserContext);
}

/** How a login is shown when it has no name yet — the person's own
 * name first, then whichever sign-in identifier they have. */
export function userLabel(user: { name?: string | null; email?: string | null; phone?: string | null }): string {
  return user.name?.trim() || user.email || user.phone || 'Unnamed login';
}

export function roleLabel(role: UserRoleName): string {
  return role === 'OWNER' ? 'Owner' : 'Staff';
}

/** Shown in place of an owner-only screen (Team, Activity log) when a staff
 * login opens it — a plain explanation instead of an error page. */
export function OwnerOnlyNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto mt-10 max-w-[420px] rounded-xl2 border border-line bg-surface p-6 text-center shadow-card">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
        <ShieldCheck size={20} />
      </span>
      <h1 className="mt-3 text-[16px] font-extrabold text-ink">{title}</h1>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{message}</p>
    </div>
  );
}
