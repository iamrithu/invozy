'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Mail, Phone, Dices, UserPlus, UserRound, CheckCircle2, Pencil } from 'lucide-react';
import { Dialog, DialogFormContent, DialogFormHeader, DialogFormIcon, DialogFormBody, DialogFormFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
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

/** Add a login, or fix an existing one's name/email/phone. Creating ends on
 * a "share these details" screen, since the owner has to pass the
 * temporary password on to the person anyway. */
export function LoginFormDialog({
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
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<TeamRole>('STAFF');
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Credentials | null>(null);

  // Fresh form every time it opens — no leftover password or errors from
  // the previous person.
  useEffect(() => {
    if (!open) return;
    setPassword('');
    setRole('STAFF');
    setFieldErrors({});
    setDone(null);
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const details = { name: String(form.get('name') ?? ''), email: String(form.get('email') ?? ''), phone: String(form.get('phone') ?? '') };
    setPending(true);
    setFieldErrors({});
    const res = member ? await updateLogin(member.id, details) : await createLogin({ ...details, password, role });
    setPending(false);
    if (res.error) {
      setFieldErrors(res.fieldErrors ?? {});
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogFormContent>
        {done ? (
          <ShareCredentials title="Login ready" credentials={done} onClose={() => onOpenChange(false)} />
        ) : (
          <form onSubmit={handleSubmit} className="contents">
            <DialogFormHeader>
              <DialogFormIcon>{editing ? <Pencil size={16} /> : <UserPlus size={16} />}</DialogFormIcon>
              <div className="min-w-0">
                <DialogTitle className="text-[15px]">{editing ? `Edit ${userLabel(member)}` : 'Add staff login'}</DialogTitle>
                <DialogDescription className="text-[11.5px] text-ink-faint">
                  {editing ? 'Fix their name or the email/phone they sign in with.' : 'Give someone their own sign-in, so everything they do is under their name.'}
                </DialogDescription>
              </div>
            </DialogFormHeader>

            <DialogFormBody>
              <div className="space-y-3">
                <Field label="Name" name="name" icon={UserRound} defaultValue={member?.name ?? ''} placeholder="e.g. Ravi Kumar" error={fieldErrors.name} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Email" name="email" type="email" icon={Mail} defaultValue={member?.email ?? ''} error={fieldErrors.email} />
                  <Field label="Phone" name="phone" type="tel" icon={Phone} defaultValue={member?.phone ?? ''} mono error={fieldErrors.phone} />
                </div>
                <p className="-mt-1 text-[11px] text-ink-faint">Fill in at least one — it&apos;s what they type to sign in.</p>

                {!editing && (
                  <>
                    <div>
                      <Field
                        label="Temporary password"
                        name="password"
                        type="password"
                        icon={KeyRound}
                        mono
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        error={fieldErrors.password}
                      />
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-ink-faint">At least 8 characters. They can change it later from My account.</span>
                        <button type="button" onClick={() => setPassword(suggestPassword())} className="flex flex-shrink-0 items-center gap-1 text-[11.5px] font-bold text-brand hover:underline">
                          <Dices size={12} /> Suggest one
                        </button>
                      </div>
                    </div>

                    <fieldset>
                      <legend className="mb-1.5 text-[12px] font-bold text-ink-soft">Role</legend>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <RoleOption value="STAFF" selected={role} onSelect={setRole} title="Staff" hint="Bills, payments, stock. No deletes or settings." />
                        <RoleOption value="OWNER" selected={role} onSelect={setRole} title="Owner" hint="Everything, including logins and deletes." />
                      </div>
                    </fieldset>
                  </>
                )}
              </div>
            </DialogFormBody>

            <DialogFormFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                <Check size={13} /> {pending ? 'Saving…' : editing ? 'Save changes' : 'Create login'}
              </Button>
            </DialogFormFooter>
          </form>
        )}
      </DialogFormContent>
    </Dialog>
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

/** The one time the owner sees a temporary password in full — with a copy
 * button so it can go straight into a WhatsApp/SMS to the person. */
function ShareCredentials({ title, credentials, onClose }: { title: string; credentials: Credentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = `Your ASB login\nSign in with: ${credentials.signInWith}\nPassword: ${credentials.password}\n\nPlease change the password after you sign in (My account → Security).`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Couldn’t copy — select the details and copy them by hand.');
    }
  }

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
