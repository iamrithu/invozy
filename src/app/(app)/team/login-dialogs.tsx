'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Dices, UserPlus, CheckCircle2, Pencil } from 'lucide-react';
import { Dialog, DialogFormContent, DialogFormHeader, DialogFormIcon, DialogFormBody, DialogFormFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormField, FormGrid, FormSection, FormSheet, FormSheetFrame, Initials, Tag, invalidClass, type FormValues } from '@/components/ui/form-sheet';
import { Button } from '@/components/ui/button';
import { createLogin, updateLogin, resetLoginPassword, type TeamMember, type TeamRole } from '@/actions/team';
import { userLabel } from '@/components/current-user';

// No 0/O, 1/l/I — this password gets read out over the phone or copied off
// a WhatsApp message by someone who'll type it on a phone keyboard.
const PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

function suggestPassword(length = 10) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
}

type Credentials = { name: string; signInWith: string; password: string };

const LOGIN_FIELDS: Record<string, { section: string; label: string }> = {
  name: { section: 'person', label: 'Name' },
  email: { section: 'person', label: 'Email' },
  phone: { section: 'person', label: 'Phone' },
  password: { section: 'password', label: 'Password' },
};

/** Add a login, or fix an existing one's name/email/phone. Creating ends on
 * a "share these details" screen, since the owner has to pass the
 * temporary password on to the person anyway. */
export function LoginFormSheet({
  open,
  onOpenChange,
  member,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit that login; absent = add a new one. */
  member?: TeamMember | null;
  onSaved: () => void;
}) {
  const editing = !!member;
  const [values, setValues] = useState<FormValues>({});
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<TeamRole>('STAFF');
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<Credentials | null>(null);

  // Fresh form every time it opens — no leftover password or errors from
  // the previous person.
  useEffect(() => {
    if (!open) return;
    setPassword('');
    setRole('STAFF');
    setFieldErrors({});
    setError(undefined);
    setDone(null);
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const details = { name: String(form.get('name') ?? ''), email: String(form.get('email') ?? ''), phone: String(form.get('phone') ?? '') };
    setPending(true);
    setFieldErrors({});
    setError(undefined);
    const res = member ? await updateLogin(member.id, details) : await createLogin({ ...details, password, role });
    setPending(false);
    if (res.error) {
      setFieldErrors(res.fieldErrors ?? {});
      setError(res.error);
      toast.error(res.error);
      return;
    }
    onSaved();
    if (member) {
      toast.success('Login updated');
      onOpenChange(false);
      return;
    }
    toast.success(`Login created for ${details.name.trim()}`);
    setDone({ name: details.name.trim(), signInWith: details.email.trim().toLowerCase() || details.phone.replace(/[\s()-]/g, ''), password });
  }

  if (done) {
    return (
      <FormSheetFrame open={open} onOpenChange={onOpenChange} icon={<CheckCircle2 size={18} />} title="Login ready" subtitle={`Team · send these to ${done.name}`}>
        <ShareCredentialsBody credentials={done} onClose={() => onOpenChange(false)} />
      </FormSheetFrame>
    );
  }

  const name = values.name?.trim() ?? '';
  const signInWith = values.email?.trim().toLowerCase() || values.phone?.trim() || '';
  const issuesIn = (section: string) => Object.keys(fieldErrors).filter((k) => LOGIN_FIELDS[k]?.section === section).length;
  const sections = [
    { id: 'person', label: 'Person', done: !!name && !!signInWith && !issuesIn('person'), issues: issuesIn('person') },
    ...(editing
      ? []
      : [
          { id: 'role', label: 'Role', done: true },
          { id: 'password', label: 'Password', done: password.length >= 8 && !issuesIn('password'), issues: issuesIn('password') },
        ]),
  ];

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      icon={editing ? <Pencil size={18} /> : <UserPlus size={18} />}
      title={editing ? 'Edit login' : 'New team login'}
      subtitle={editing ? `Team · ${userLabel(member)}` : 'Team · their own sign-in, so their work is under their name'}
      onValues={setValues}
      onSubmit={handleSubmit}
      sections={sections}
      preview={{
        caption: 'in the team list',
        content: (
          <div className="flex items-center gap-3">
            <Initials name={name || '?'} />
            <div className="min-w-0 flex-1">
              <div className={clsx('truncate text-[14px] font-bold', name ? 'text-ink' : 'text-ink-faint')}>{name || 'Their name'}</div>
              <div className="mt-0.5 truncate font-mono text-[12px] text-ink-soft">{signInWith || 'email or phone'}</div>
            </div>
            <Tag tone={(editing ? member?.role : role) === 'OWNER' ? 'red' : 'grey'}>{(editing ? member?.role : role) === 'OWNER' ? 'Owner' : 'Staff'}</Tag>
          </div>
        ),
      }}
      submitLabel={editing ? 'Save changes' : 'Create login'}
      pending={pending}
      issues={Object.keys(fieldErrors).map((k) => LOGIN_FIELDS[k]?.label ?? k)}
      error={error}
    >
      <FormSection id="person" n={1} title="Person" aside="They sign in with the email or phone" done={sections[0].done}>
        <FormGrid>
          <FormField label="Name" required htmlFor="login-name" span={6} error={fieldErrors.name}>
            <Input id="login-name" name="name" defaultValue={member?.name ?? ''} placeholder="e.g. Ravi Kumar" autoComplete="off" className={clsx(fieldErrors.name && invalidClass)} />
          </FormField>
          <FormField label="Email" htmlFor="login-email" span={3} error={fieldErrors.email}>
            <Input id="login-email" name="email" type="email" inputMode="email" defaultValue={member?.email ?? ''} autoComplete="off" className={clsx(fieldErrors.email && invalidClass)} />
          </FormField>
          <FormField label="Phone" htmlFor="login-phone" span={3} error={fieldErrors.phone}>
            <Input id="login-phone" name="phone" type="tel" inputMode="tel" defaultValue={member?.phone ?? ''} autoComplete="off" className={clsx('font-mono', fieldErrors.phone && invalidClass)} />
          </FormField>
          <p className="col-span-2 -mt-1 text-[12px] text-ink-faint sm:col-span-6 sm:text-[11px]">Fill in at least one — it&apos;s what they type to sign in.</p>
        </FormGrid>
      </FormSection>

      {!editing && (
        <>
          <FormSection id="role" n={2} title="Role" aside="Change any time from Team" done>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <RoleOption value="STAFF" selected={role} onSelect={setRole} title="Staff" hint="Bills, payments, stock. No deletes or settings." />
              <RoleOption value="OWNER" selected={role} onSelect={setRole} title="Owner" hint="Everything, including logins and deletes." />
            </div>
          </FormSection>

          <FormSection id="password" n={3} title="Password" aside="They change it after signing in" done={sections[2]?.done}>
            <FormGrid>
              <FormField label="Temporary password" required htmlFor="login-password" span={6} error={fieldErrors.password} help="At least 8 characters. They can change it later from My account.">
                <div className="flex gap-2">
                  <Input
                    id="login-password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    spellCheck={false}
                    className={clsx('font-mono', fieldErrors.password && invalidClass)}
                  />
                  <Button type="button" variant="outline" onClick={() => setPassword(suggestPassword())} className="h-9 flex-shrink-0 max-sm:h-11">
                    <Dices size={14} /> Generate
                  </Button>
                  <CopyButton text={password} />
                </div>
              </FormField>
            </FormGrid>
          </FormSection>
        </>
      )}
    </FormSheet>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Couldn’t copy — select it and copy it by hand.');
    }
  }
  return (
    <Button type="button" variant="outline" onClick={copy} disabled={!text} aria-label="Copy password" className="h-9 w-9 flex-shrink-0 px-0 max-sm:h-11 max-sm:w-11">
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </Button>
  );
}

function RoleOption({ value, selected, onSelect, title, hint }: { value: TeamRole; selected: TeamRole; onSelect: (r: TeamRole) => void; title: string; hint: string }) {
  const active = selected === value;
  return (
    <label
      className={clsx(
        'flex cursor-pointer items-start gap-2.5 rounded-sm2 border p-2.5 transition-colors',
        active ? 'border-brand bg-brand-light' : 'border-line hover:border-brand/50'
      )}
    >
      <input type="radio" name="role" value={value} checked={active} onChange={() => onSelect(value)} className="mt-0.5 accent-brand" />
      <span>
        <span className={clsx('block text-[12.5px] font-bold', active ? 'text-brand-dark' : 'text-ink')}>{title}</span>
        <span className="block text-[11px] leading-snug text-ink-faint">{hint}</span>
      </span>
    </label>
  );
}

/** Sets a new temporary password for someone else's login. */
export function ResetPasswordDialog({
  open,
  onOpenChange,
  member,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<Credentials | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setError(undefined);
    setDone(null);
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!member) return;
    setPending(true);
    setError(undefined);
    const res = await resetLoginPassword(member.id, password);
    setPending(false);
    if (res.error) {
      setError(res.fieldErrors?.password ?? res.error);
      toast.error(res.error);
      return;
    }
    onSaved();
    toast.success(`New password set for ${userLabel(member)}`);
    setDone({ name: userLabel(member), signInWith: member.email ?? member.phone ?? '', password });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogFormContent>
        {done ? (
          <ShareCredentials title="Password changed" credentials={done} onClose={() => onOpenChange(false)} />
        ) : (
          <form onSubmit={handleSubmit} className="contents">
            <DialogFormHeader>
              <DialogFormIcon>
                <KeyRound size={16} />
              </DialogFormIcon>
              <div className="min-w-0">
                <DialogTitle className="text-[15px]">Reset password</DialogTitle>
                <DialogDescription className="text-[11.5px] text-ink-faint">For {member ? userLabel(member) : ''} — their old password stops working.</DialogDescription>
              </div>
            </DialogFormHeader>
            <DialogFormBody>
              <Field label="New temporary password" name="password" type="password" icon={KeyRound} mono value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-faint">At least 8 characters.</span>
                <button type="button" onClick={() => setPassword(suggestPassword())} className="flex flex-shrink-0 items-center gap-1 text-[11.5px] font-bold text-brand hover:underline">
                  <Dices size={12} /> Suggest one
                </button>
              </div>
            </DialogFormBody>
            <DialogFormFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                <Check size={13} /> {pending ? 'Saving…' : 'Set password'}
              </Button>
            </DialogFormFooter>
          </form>
        )}
      </DialogFormContent>
    </Dialog>
  );
}

function credentialsMessage(c: Credentials) {
  return `Your ASB login\nSign in with: ${c.signInWith}\nPassword: ${c.password}\n\nPlease change the password after you sign in (My account → Security).`;
}

function useCopyCredentials(credentials: Credentials) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(credentialsMessage(credentials));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Couldn’t copy — select the details and copy them by hand.');
    }
  }
  return { copied, copy };
}

function CredentialsList({ credentials }: { credentials: Credentials }) {
  return (
    <dl className="space-y-0 rounded-sm2 border border-line bg-bg px-3.5 py-1">
      <div className="flex items-center justify-between gap-3 border-b border-dashed border-line py-2 text-[12.5px]">
        <dt className="text-ink-faint">Sign in with</dt>
        <dd className="truncate font-mono font-semibold text-ink">{credentials.signInWith}</dd>
      </div>
      <div className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
        <dt className="text-ink-faint">Password</dt>
        <dd className="select-all font-mono font-semibold text-ink">{credentials.password}</dd>
      </div>
    </dl>
  );
}

/** The one time the owner sees a new login's password in full — the
 * sheet's last step, with a copy button so it can go straight into a
 * WhatsApp/SMS to the person. */
function ShareCredentialsBody({ credentials, onClose }: { credentials: Credentials; onClose: () => void }) {
  const { copied, copy } = useCopyCredentials(credentials);
  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-[22px]">
        <p className="mb-3 text-[13px] text-ink-soft sm:text-[12.5px]">Send these to {credentials.name}. You won&apos;t see this password again.</p>
        <CredentialsList credentials={credentials} />
      </div>
      <div className="flex flex-shrink-0 gap-2.5 border-t border-line px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 sm:h-16 sm:items-center sm:justify-end sm:gap-2 sm:px-[22px] sm:py-0">
        <Button type="button" variant="outline" onClick={copy} className="h-12 flex-1 text-[14px] sm:h-9 sm:flex-none sm:text-[13px]">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy details'}
        </Button>
        <Button type="button" onClick={onClose} className="h-12 flex-1 text-[14px] sm:h-9 sm:flex-none sm:text-[13px]">
          Done
        </Button>
      </div>
    </>
  );
}

/** Same, in the reset-password dialog. */
function ShareCredentials({ title, credentials, onClose }: { title: string; credentials: Credentials; onClose: () => void }) {
  const { copied, copy } = useCopyCredentials(credentials);
  return (
    <>
      <DialogFormHeader>
        <DialogFormIcon className="bg-green-soft text-green">
          <CheckCircle2 size={16} />
        </DialogFormIcon>
        <div className="min-w-0">
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          <DialogDescription className="text-[11.5px] text-ink-faint">Send these to {credentials.name}. You won&apos;t see this password again.</DialogDescription>
        </div>
      </DialogFormHeader>
      <DialogFormBody>
        <CredentialsList credentials={credentials} />
      </DialogFormBody>
      <DialogFormFooter>
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy details'}
        </Button>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFormFooter>
    </>
  );
}
