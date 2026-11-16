'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Package, Users, Receipt, KeyRound, Mail, Phone, MapPin, IdCard, Clock, Ban, RotateCcw, Puzzle, Wallet, AlertCircle, UserX, UserCheck } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fmtInr } from '@/lib/gst';
import { MODULES, type ModuleKey } from '@/lib/modules';
import type { AdminCompanyDetail } from '@/actions/admin';
import { useCompanyForAdmin, useSetCompanyActive, useSetCompanyModules, useSetUserActive } from '@/hooks/use-admin';
import { ResetPasswordDialog, type CompanyUser } from '../../admin-companies-client';

type Login = AdminCompanyDetail['users'][number];

export function CompanyDetailClient({ company: initial }: { company: AdminCompanyDetail }) {
  const { data } = useCompanyForAdmin(initial.id, initial);
  const company = data ?? initial;
  const [resetTarget, setResetTarget] = useState<CompanyUser | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [loginTarget, setLoginTarget] = useState<Login | null>(null);
  const setActive = useSetCompanyActive();
  const setModules = useSetCompanyModules();
  const setUserActive = useSetUserActive();

  async function changeActive(active: boolean) {
    const res = await setActive.mutateAsync({ companyId: company.id, active });
    if (res.error) return toast.error(res.error);
    toast.success(active ? 'Company restored' : 'Company suspended');
    setConfirmSuspend(false);
  }

  async function toggleModule(key: ModuleKey, on: boolean) {
    const disabled = on ? company.disabledModules.filter((k) => k !== key) : [...company.disabledModules, key];
    const res = await setModules.mutateAsync({ companyId: company.id, disabled });
    if (res.error) return toast.error(res.error);
    toast.success(`${MODULES.find((m) => m.key === key)?.label} ${on ? 'switched on' : 'switched off'}`);
  }

  async function changeLogin(user: Login) {
    const res = await setUserActive.mutateAsync({ userId: user.id, active: !user.active });
    if (res.error) return toast.error(res.error);
    toast.success(user.active ? 'Login switched off' : 'Login switched on');
    setLoginTarget(null);
  }

  return (
    <div>
      <Link href="/admin" className="mb-4 flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-ink">
        <ArrowLeft size={13} /> All companies
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl2 border border-line bg-surface p-5 shadow-card">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl2 bg-brand-light text-brand-dark">
          <Building2 size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-extrabold text-ink">{company.name}</span>
            {company.active ? <Badge variant="green">Active</Badge> : <Badge variant="red">Suspended</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-[11.5px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} /> {[company.district, company.state].filter(Boolean).join(', ')}
            </span>
            {company.email && (
              <span className="flex items-center gap-1.5">
                <Mail size={12} /> {company.email}
              </span>
            )}
            {company.phone && (
              <span className="flex items-center gap-1.5">
                <Phone size={12} /> {company.phone}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <IdCard size={12} /> {company.gstin ?? 'GSTIN not set'}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={12} /> Joined {new Date(company.createdAt).toLocaleDateString('en-IN')}
            </span>
          </div>
        </div>
        {company.active ? (
          <Button type="button" variant="outline" onClick={() => setConfirmSuspend(true)}>
            <Ban size={13} /> Suspend
          </Button>
        ) : (
          <Button type="button" onClick={() => changeActive(true)} disabled={setActive.isPending}>
            <RotateCcw size={13} /> Restore access
          </Button>
        )}
      </div>

      {!company.active && (
        <div className="mb-4 flex items-start gap-2 rounded-lg2 border border-red/30 bg-red/5 p-3 text-[12.5px] text-ink-soft">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0 text-red" />
          Suspended: its logins can’t sign in and its shared invoice links don’t open. All its data is kept as it was.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={<Receipt size={14} />} label="Invoices" value={String(company._count.invoices)} />
        <StatCard icon={<Users size={14} />} label="Customers" value={String(company._count.customers)} />
        <StatCard icon={<Package size={14} />} label="Products" value={String(company._count.products)} />
        <StatCard icon={<Wallet size={14} />} label="Billed (issued)" value={fmtInr(company.billed)} />
        <StatCard icon={<AlertCircle size={14} />} label="Outstanding" value={fmtInr(company.outstanding)} />
        <StatCard icon={<Clock size={14} />} label="Last invoice" value={company.lastInvoiceAt ? new Date(company.lastInvoiceAt).toLocaleDateString('en-IN') : '—'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <div className="mb-1 flex items-center gap-2 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">
            <Puzzle size={13} /> Modules
          </div>
          <p className="mb-3 text-[11.5px] text-ink-faint">Switching a module off hides it from this company. Nothing is deleted; switching it back on restores it.</p>
          <div className="space-y-2">
            {MODULES.map((m) => {
              const on = !company.disabledModules.includes(m.key);
              return (
                <label key={m.key} className="flex cursor-pointer items-center gap-3 rounded-lg2 border border-line bg-bg p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold text-ink">{m.label}</div>
                    <div className="text-[11px] text-ink-faint">{m.description}</div>
                  </div>
                  <Switch checked={on} disabled={setModules.isPending} onChange={(e) => toggleModule(m.key, e.target.checked)} aria-label={`${m.label} module`} />
                </label>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <div className="mb-3 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">Logins</div>
          <div className="space-y-2">
            {company.users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2.5 rounded-lg2 border border-line bg-bg p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-bold text-ink">{u.name || u.email || u.phone}</span>
                    <Badge variant={u.role === 'OWNER' ? 'brand' : 'default'}>{u.role === 'OWNER' ? 'Owner' : 'Staff'}</Badge>
                    {!u.active && <Badge variant="red">Off</Badge>}
                  </div>
                  <div className="truncate text-[11px] text-ink-faint">
                    {[u.name ? u.email || u.phone : null, `Added ${new Date(u.createdAt).toLocaleDateString('en-IN')}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setResetTarget(u)}>
                  <KeyRound size={12} /> Reset password
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setLoginTarget(u)} aria-label={u.active ? 'Switch login off' : 'Switch login on'}>
                  {u.active ? <UserX size={13} /> : <UserCheck size={13} />}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card lg:col-span-2">
          <div className="mb-3 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">Recent invoices</div>
          {company.recentInvoices.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-faint">No invoices yet.</p>
          ) : (
            <div className="space-y-1.5">
              {company.recentInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2.5 border-b border-dashed border-line py-1.5 text-[12.5px] last:border-0">
                  <span className="min-w-0 flex-1 truncate font-mono font-bold text-ink">{inv.number}</span>
                  <span className="hidden flex-shrink-0 text-ink-faint sm:inline">{new Date(inv.date).toLocaleDateString('en-IN')}</span>
                  <span className="max-w-[40%] flex-shrink truncate text-ink-faint">{inv.customerName}</span>
                  <StatusBadge status={inv.status} />
                  <span className="flex-shrink-0 font-mono font-bold text-ink">{fmtInr(inv.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ResetPasswordDialog user={resetTarget} onOpenChange={(open) => !open && setResetTarget(null)} />
      <ConfirmDialog
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title={`Suspend ${company.name}?`}
        description="Its logins won’t be able to sign in and its shared invoice links will stop opening. Nothing is deleted — you can restore access at any time."
        confirmLabel="Suspend company"
        pending={setActive.isPending}
        onConfirm={() => changeActive(false)}
        icon={Ban}
      />
      <ConfirmDialog
        open={!!loginTarget}
        onOpenChange={(open) => !open && setLoginTarget(null)}
        title={loginTarget?.active ? 'Switch this login off?' : 'Switch this login on?'}
        description={loginTarget?.active ? `${loginTarget?.name || loginTarget?.email || loginTarget?.phone} won’t be able to sign in until it’s switched back on.` : 'This login will be able to sign in again.'}
        confirmLabel={loginTarget?.active ? 'Switch off' : 'Switch on'}
        destructive={!!loginTarget?.active}
        pending={setUserActive.isPending}
        onConfirm={() => loginTarget && changeLogin(loginTarget)}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
      <div className="flex h-7 w-7 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">{icon}</div>
      <div className="mt-2 truncate font-mono text-[16px] font-extrabold text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}
