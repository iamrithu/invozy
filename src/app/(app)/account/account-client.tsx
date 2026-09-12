'use client';

import { useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import { Mail, Phone, ShieldCheck, Building2, Pencil, Check, KeyRound, IdCard } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { updateMyProfile, changeMyPassword, type ProfileFormState, type PasswordFormState } from '@/actions/account';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFormContent, DialogFormHeader, DialogFormIcon, DialogFormBody, DialogFormFooter } from '@/components/ui/dialog';
import { initials, hashColor } from '@/lib/avatar';

type AccountUser = { email: string | null; phone: string | null; role: string; companyName: string };

const TABS = [
  { id: 'profile', label: 'Profile', icon: IdCard },
  { id: 'security', label: 'Security', icon: KeyRound },
] as const;

export function AccountClient({ user }: { user: AccountUser }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('profile');
  const displayName = user.email ?? user.phone ?? 'U';

  function openTab(t: (typeof TABS)[number]['id']) {
    setTab(t);
    setOpen(true);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="flex flex-wrap items-center gap-4 rounded-xl2 border border-line bg-surface p-5 shadow-card lg:col-span-12">
        <span
          className="flex h-[64px] w-[64px] flex-shrink-0 items-center justify-center rounded-full text-[20px] font-extrabold text-white shadow-brand"
          style={{ background: hashColor(displayName) }}
        >
          {initials(displayName.includes('@') ? displayName.split('@')[0] : displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[18px] font-extrabold text-ink">{user.email ?? user.phone}</span>
            <span className="rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-dark">
              <ShieldCheck size={10} className="mr-1 inline" /> {user.role === 'OWNER' ? 'Owner' : user.role}
            </span>
          </div>
          <Link href="/company" className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-faint hover:text-brand">
            <Building2 size={12} /> {user.companyName}
          </Link>
        </div>
      </div>

      <InfoCard icon={<IdCard size={13} />} title="Profile" className="lg:col-span-6" action={<EditButton onClick={() => openTab('profile')} />}>
        <InfoRow icon={<Mail size={12} />} k="Email" v={user.email ?? 'Not set'} />
        <InfoRow icon={<Phone size={12} />} k="Phone" v={user.phone ?? 'Not set'} />
      </InfoCard>

      <InfoCard icon={<KeyRound size={13} />} title="Security" className="lg:col-span-6" action={<EditButton label="Change password" onClick={() => openTab('security')} />}>
        <InfoRow icon={<KeyRound size={12} />} k="Password" v="••••••••" />
        <p className="pt-2 text-[11.5px] text-ink-faint">Keep this to yourself — anyone with it can sign in to your workspace.</p>
      </InfoCard>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setTab('profile');
        }}
      >
        <DialogFormContent>
          <DialogFormHeader>
            <DialogFormIcon>
              <IdCard size={16} />
            </DialogFormIcon>
            <div className="text-[15px] font-extrabold text-ink">My account</div>
          </DialogFormHeader>

          <div className="flex flex-shrink-0 gap-4 border-b border-line px-[22px]">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 whitespace-nowrap border-b-[2.5px] py-2.5 text-[12.5px] font-bold transition-colors ${
                    active ? 'border-brand text-brand' : 'border-transparent text-ink-faint hover:text-ink-soft'
                  }`}
                >
                  <Icon size={13} /> {t.label}
                </button>
              );
            })}
          </div>

          {tab === 'profile' ? <ProfileTab user={user} onSaved={() => setOpen(false)} /> : <SecurityTab onSaved={() => setOpen(false)} />}
        </DialogFormContent>
      </Dialog>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  action,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl2 border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand/50 ${className ?? ''}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark">{icon}</span>
        <span className="flex-1 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">{title}</span>
        {action}
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function EditButton({ label = 'Edit', onClick }: { label?: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} className="h-7 px-2 text-[11px]">
      <Pencil size={11} /> {label}
    </Button>
  );
}

function InfoRow({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-b border-dashed border-line py-1.5 text-[12.5px] last:border-0">
      <span className="flex items-center gap-1.5 text-ink-faint">
        {icon} {k}
      </span>
      <span className="font-semibold text-ink-body">{v}</span>
    </div>
  );
}

function ProfileTab({ user, onSaved }: { user: AccountUser; onSaved: () => void }) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(updateMyProfile, {});
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!submittedRef.current) return;
    submittedRef.current = false;
    if (!state.error) {
      toast.success('Profile updated');
      onSaved();
    } else {
      toast.error(state.error);
    }
  }, [state, onSaved]);

  return (
    <form action={formAction} onSubmit={() => (submittedRef.current = true)} className="contents">
      <DialogFormBody>
        <div className="space-y-3">
          <Field label="Email" name="email" type="email" icon={Mail} defaultValue={user.email ?? ''} error={state.fieldErrors?.email} />
          <Field label="Phone" name="phone" icon={Phone} defaultValue={user.phone ?? ''} error={state.fieldErrors?.phone} />
          <p className="text-[11px] text-ink-faint">Your company&apos;s contact email on the Company profile always matches this email.</p>
          {state.error && <p className="text-[12.5px] font-bold text-destructive">{state.error}</p>}
        </div>
      </DialogFormBody>
      <DialogFormFooter>
        <Button type="submit" disabled={pending}>
          <Check size={13} /> {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFormFooter>
    </form>
  );
}

function SecurityTab({ onSaved }: { onSaved: () => void }) {
  const [state, formAction, pending] = useActionState<PasswordFormState, FormData>(changeMyPassword, {});
  const submittedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!submittedRef.current) return;
    submittedRef.current = false;
    if (!state.error) {
      toast.success('Password changed');
      formRef.current?.reset();
      onSaved();
    } else {
      toast.error(state.error);
    }
  }, [state, onSaved]);

  return (
    <form ref={formRef} action={formAction} onSubmit={() => (submittedRef.current = true)} className="contents">
      <DialogFormBody>
        <div className="space-y-3">
          <Field label="Current password" name="currentPassword" type="password" icon={KeyRound} error={state.fieldErrors?.currentPassword} />
          <Field label="New password" name="newPassword" type="password" icon={KeyRound} error={state.fieldErrors?.newPassword} />
          <Field label="Confirm new password" name="confirmPassword" type="password" icon={KeyRound} error={state.fieldErrors?.confirmPassword} />
          {state.error && <p className="text-[12.5px] font-bold text-destructive">{state.error}</p>}
        </div>
      </DialogFormBody>
      <DialogFormFooter>
        <Button type="submit" disabled={pending}>
          <Check size={13} /> {pending ? 'Saving…' : 'Change password'}
        </Button>
      </DialogFormFooter>
    </form>
  );
}
