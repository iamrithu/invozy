'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Mail, MoreHorizontal, Pencil, Phone, ShieldCheck, UserCheck, UserCog, UserPlus, UserRound, UsersRound, UserX, X } from 'lucide-react';
import { listLogins, setLoginActive, setLoginRole, type TeamMember } from '@/actions/team';
import { unwrap } from '@/lib/action-result';
import { initials, hashColor } from '@/lib/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { roleLabel, useCurrentUser, userLabel } from '@/components/current-user';
import { LoginFormSheet, ResetPasswordDialog } from './login-dialogs';

const ADDED_FMT = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

// What the requireOwner() checks across the app's actions add up to —
// spelled out so the owner knows what handing someone a staff login means.
const STAFF_CAN = ['Create and edit invoices', 'Record payments', 'Receive stock', 'Add and edit customers and products'];
const STAFF_CANNOT = ['Delete anything', 'Change company settings', 'Add or manage logins', 'See the activity log'];

type PendingChange = { kind: 'role' | 'active'; member: TeamMember };

export function TeamClient({ initialUsers }: { initialUsers: TeamMember[] }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const { data: users = initialUsers } = useQuery({
    queryKey: ['team'],
    queryFn: async () => unwrap(await listLogins()).users ?? [],
    initialData: initialUsers,
  });

  const [addOpen, setAddOpen] = useState(false);
  // Target kept after close so the dialog doesn't blank out mid fade-out.
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [change, setChange] = useState<PendingChange | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changePending, setChangePending] = useState(false);

  const activeCount = users.filter((u) => u.active).length;

  function refresh() {
    // ['activity'] too — each change here writes an activity log row.
    return Promise.all([queryClient.invalidateQueries({ queryKey: ['team'] }), queryClient.invalidateQueries({ queryKey: ['activity'] })]);
  }

  function askToChange(next: PendingChange) {
    setChange(next);
    setChangeOpen(true);
  }

  async function applyChange() {
    if (!change) return;
    const { kind, member } = change;
    setChangePending(true);
    const res = kind === 'role' ? await setLoginRole(member.id, member.role === 'OWNER' ? 'STAFF' : 'OWNER') : await setLoginActive(member.id, !member.active);
    setChangePending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const name = userLabel(member);
    toast.success(
      kind === 'role' ? `${name} is now ${member.role === 'OWNER' ? 'staff' : 'an owner'}` : member.active ? `${name}'s login is disabled` : `${name} can sign in again`
    );
    setChangeOpen(false);
    await refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
            <UsersRound size={18} className="text-brand" /> Team
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Everyone gets their own login, so the activity log shows who did what.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus size={13} /> Add staff login
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card lg:col-span-8">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">Logins</span>
            <span className="text-[11.5px] text-ink-faint">
              {activeCount} active{users.length > activeCount && ` · ${users.length - activeCount} disabled`}
            </span>
          </div>
          <ul>
            {users.map((u) => (
              <MemberRow
                key={u.id}
                member={u}
                isMe={u.id === me.id}
                onEdit={() => {
                  setEditTarget(u);
                  setEditOpen(true);
                }}
                onResetPassword={() => {
                  setResetTarget(u);
                  setResetOpen(true);
                }}
                onToggleRole={() => askToChange({ kind: 'role', member: u })}
                onToggleActive={() => askToChange({ kind: 'active', member: u })}
              />
            ))}
          </ul>
        </div>

        <aside className="h-fit rounded-xl2 border border-line bg-surface p-4 shadow-card lg:col-span-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
              <ShieldCheck size={13} />
            </span>
            <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">What staff can do</span>
          </div>
          <ul className="space-y-1.5">
            {STAFF_CAN.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[12.5px] text-ink-body">
                <Check size={14} className="mt-0.5 flex-shrink-0 text-green" /> {t}
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1.5 border-t border-dashed border-line pt-3">
            {STAFF_CANNOT.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[12.5px] text-ink-soft">
                <X size={14} className="mt-0.5 flex-shrink-0 text-red" /> {t}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-ink-faint">Owners can do everything. There&apos;s always at least one active owner.</p>
        </aside>
      </div>

      <LoginFormSheet open={addOpen} onOpenChange={setAddOpen} onSaved={refresh} />
      <LoginFormSheet open={editOpen} onOpenChange={setEditOpen} member={editTarget} onSaved={refresh} />
      <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} member={resetTarget} onSaved={refresh} />
      <ConfirmDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        pending={changePending}
        onConfirm={applyChange}
        {...confirmCopy(change)}
      />
    </div>
  );
}

/** Title/description/button for the confirm step of a role or on/off
 * change — the description says what actually changes for that person. */
function confirmCopy(change: PendingChange | null): { title: string; description: string; confirmLabel: string; destructive: boolean } {
  if (!change) return { title: '', description: '', confirmLabel: 'Confirm', destructive: false };
  const { kind, member } = change;
  const name = userLabel(member);
  if (kind === 'role') {
    return member.role === 'OWNER'
      ? {
          title: `Make ${name} staff?`,
          description: 'They keep billing, payments and stock, but can no longer delete anything, change company settings, manage logins or see the activity log.',
          confirmLabel: 'Make staff',
          destructive: false,
        }
      : {
          title: `Make ${name} an owner?`,
          description: 'Owners can do everything — delete records, change company settings, manage logins and see the activity log.',
          confirmLabel: 'Make owner',
          destructive: false,
        };
  }
  return member.active
    ? {
        title: `Disable ${name}'s login?`,
        description: 'They’re signed out straight away and can’t sign in until you turn it back on. Everything they did stays on record.',
        confirmLabel: 'Disable login',
        destructive: true,
      }
    : {
        title: `Turn ${name}'s login back on?`,
        description: 'They can sign in again with their existing password.',
        confirmLabel: 'Enable login',
        destructive: false,
      };
}

function MemberRow({
  member,
  isMe,
  onEdit,
  onResetPassword,
  onToggleRole,
  onToggleActive,
}: {
  member: TeamMember;
  isMe: boolean;
  onEdit: () => void;
  onResetPassword: () => void;
  onToggleRole: () => void;
  onToggleActive: () => void;
}) {
  const label = userLabel(member);
  return (
    <li className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
      <span
        className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 text-[12px] font-extrabold text-white', !member.active && 'opacity-40')}
        style={{ background: hashColor(label) }}
      >
        {initials(label.includes('@') ? label.split('@')[0] : label) || '?'}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={clsx('truncate text-[13.5px] font-bold', member.active ? 'text-ink' : 'text-ink-faint')}>{label}</span>
          {isMe && <span className="rounded-sm2 bg-surface-alt px-1.5 py-0.5 text-[10px] font-bold text-ink-soft">You</span>}
          <span
            className={clsx(
              'rounded-sm2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              member.role === 'OWNER' ? 'bg-brand-light text-brand-dark' : 'bg-surface-alt text-ink-soft'
            )}
          >
            {roleLabel(member.role)}
          </span>
          {!member.active && <span className="rounded-sm2 bg-red-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red">Disabled</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-faint">
          {member.email && (
            <span className="flex min-w-0 items-center gap-1">
              <Mail size={11} className="flex-shrink-0" /> <span className="truncate">{member.email}</span>
            </span>
          )}
          {member.phone && (
            <span className="flex items-center gap-1 font-mono">
              <Phone size={11} className="flex-shrink-0" /> {member.phone}
            </span>
          )}
          <span>Added {ADDED_FMT.format(new Date(member.createdAt))}</span>
        </div>
      </div>

      {isMe ? (
        <Button asChild variant="ghost" size="sm" className="h-8 flex-shrink-0 px-2 text-[11.5px]">
          <Link href="/account">
            <UserRound size={12} /> My account
          </Link>
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label={`Manage ${label}`}>
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil size={14} /> Edit details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onResetPassword}>
              <KeyRound size={14} /> Reset password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleRole}>
              {member.role === 'OWNER' ? <UserCog size={14} /> : <ShieldCheck size={14} />} {member.role === 'OWNER' ? 'Make staff' : 'Make owner'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onToggleActive} className={member.active ? 'text-red focus:text-red' : undefined}>
              {member.active ? <UserX size={14} /> : <UserCheck size={14} />} {member.active ? 'Disable login' : 'Enable login'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
