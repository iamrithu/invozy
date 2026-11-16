'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Building2, Plus, KeyRound, ShieldCheck, Users as UsersIcon, Mail, Phone, Lock, ChevronRight, User } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFormContent, DialogFormHeader, DialogFormIcon, DialogFormBody, DialogFormFooter, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCompaniesForAdmin, useCreateCompany, usePlatformStats, useResetUserPassword } from '@/hooks/use-admin';
import { StateSelect } from '@/components/ui/location-field';
import { fmtInr } from '@/lib/gst';
import { MODULES } from '@/lib/modules';
import { APP_NAME } from '@/lib/brand';
import type { AdminCompanyRow, AdminCompanyStatus, AdminCompanyUser, PlatformStats } from '@/actions/admin';

const PAGE_SIZE = 20;

export type CompanyUser = Pick<AdminCompanyUser, 'id' | 'email' | 'phone'>;

const STATUS_FILTERS: { key: AdminCompanyStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
];

export function AdminCompaniesClient({ initialData, initialStats }: { initialData: { items: AdminCompanyRow[]; total: number }; initialStats: PlatformStats }) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [status, setStatus] = useState<AdminCompanyStatus>('all');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<CompanyUser | null>(null);
  const { data: stats = initialStats } = usePlatformStats(initialStats);

  useEffect(() => setPage(1), [search, status]);

  const isDefaultParams = search === '' && status === 'all' && page === 1;
  const { data, isFetching, isLoading } = useCompaniesForAdmin({ search, status, page, pageSize: PAGE_SIZE });
  const items = isDefaultParams && !data ? initialData.items : data?.items ?? initialData.items;
  const total = isDefaultParams && !data ? initialData.total : data?.total ?? initialData.total;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
            <Building2 size={18} className="text-brand" /> Companies
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Every company workspace on {APP_NAME}.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={13} /> Add company
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Companies" value={String(stats.companies)} hint={`${stats.newThisMonth} new this month`} />
        <Stat label="Active" value={String(stats.active)} hint={stats.suspended ? `${stats.suspended} suspended` : 'None suspended'} />
        <Stat label="Active logins" value={String(stats.users)} hint="Owners and staff" />
        <Stat label="Billed this month" value={fmtInr(stats.billedThisMonth)} hint={`${stats.invoicesThisMonth} invoices, all companies`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name, GSTIN, owner email or phone…" className="max-w-[340px]" />
        <div className="flex rounded-md2 border border-line bg-surface p-0.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={clsx('rounded-sm2 px-3 py-1.5 text-[12px] font-bold transition-colors', status === f.key ? 'bg-brand-light text-brand' : 'text-ink-soft hover:text-ink')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-card transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
        {isLoading ? (
          <SkeletonList />
        ) : total === 0 ? (
          <div className="p-8 text-center text-[13px] text-ink-faint">No companies match.</div>
        ) : (
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Logins</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead>Last invoice</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => {
                const owner = c.users.find((u) => u.role === 'OWNER' && u.active) ?? c.users[0];
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/admin/companies/${c.id}`} className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
                          <Building2 size={15} />
                        </span>
                        <span className="min-w-0">
                          <div className="truncate text-[13px] font-bold text-ink hover:text-brand">{c.name}</div>
                          <div className="truncate text-[11px] text-ink-faint">{c.state}</div>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-ink-soft">{owner ? owner.name || owner.email || owner.phone : 'No login'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.active ? <Badge variant="green">Active</Badge> : <Badge variant="red">Suspended</Badge>}
                        {c.disabledModules.length > 0 && <Badge variant="outline">{c.disabledModules.length} module{c.disabledModules.length === 1 ? '' : 's'} off</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-ink-soft">{c._count.users}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-ink-soft">{c._count.invoices}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono font-bold text-ink">{fmtInr(c.billed)}</TableCell>
                    <TableCell className="whitespace-nowrap text-ink-faint">{c.lastInvoiceAt ? new Date(c.lastInvoiceAt).toLocaleDateString('en-IN') : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-ink-faint">{new Date(c.createdAt).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {owner && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Reset owner password"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setResetTarget(owner);
                            }}
                          >
                            <KeyRound size={14} />
                          </Button>
                        )}
                        <Button asChild type="button" size="icon" variant="ghost" aria-label="View company" className="h-8 w-8">
                          <Link href={`/admin/companies/${c.id}`} onClick={(e) => e.stopPropagation()}>
                            <ChevronRight size={14} />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>

      <AddCompanySheet open={addOpen} onOpenChange={setAddOpen} />
      <ResetPasswordDialog user={resetTarget} onOpenChange={(open) => !open && setResetTarget(null)} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-1 truncate font-mono text-[19px] font-extrabold text-ink">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-ink-faint">{hint}</div>
    </div>
  );
}

function AddCompanySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedState, setSelectedState] = useState('Tamil Nadu');
  const createCompany = useCreateCompany();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(undefined);
    setFieldErrors({});
    const result = await createCompany.mutateAsync(formData);
    if (result.error) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success('Company created');
    onOpenChange(false);
    (e.target as HTMLFormElement).reset();
    setSelectedState('Tamil Nadu');
    if (result.companyId) router.push(`/admin/companies/${result.companyId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogFormContent>
        <form onSubmit={handleSubmit} className="contents">
          <DialogFormHeader>
            <DialogFormIcon>
              <Building2 size={16} />
            </DialogFormIcon>
            <div>
              <div className="text-[15px] font-extrabold text-ink">Add company</div>
              <div className="text-[11.5px] text-ink-faint">A company workspace and its first owner login</div>
            </div>
          </DialogFormHeader>
          <DialogFormBody className="space-y-3">
            <Field label="Company name" name="companyName" icon={Building2} error={fieldErrors.companyName} />
            <StateSelect name="state" value={selectedState} onChange={setSelectedState} error={fieldErrors.state} />
            <Field label="Owner name (optional)" name="ownerName" icon={User} error={fieldErrors.ownerName} />
            <Field label="Owner email" name="email" type="email" icon={Mail} error={fieldErrors.email} />
            <Field label="Owner phone (optional if email set)" name="phone" icon={Phone} error={fieldErrors.phone} />
            <Field label="Temporary password" name="password" type="password" icon={Lock} error={fieldErrors.password} />
            <fieldset className="rounded-lg2 border border-line p-3">
              <legend className="px-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Start with these modules off</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {MODULES.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-[12px] text-ink-soft">
                    <input type="checkbox" name="disabledModules" value={m.key} className="h-3.5 w-3.5 accent-brand" />
                    {m.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && <p className="text-[12.5px] font-bold text-destructive">{error}</p>}
          </DialogFormBody>
          <DialogFormFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCompany.isPending}>
              {createCompany.isPending ? 'Creating…' : 'Create company'}
            </Button>
          </DialogFormFooter>
        </form>
      </DialogFormContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({ user, onOpenChange }: { user: CompanyUser | null; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = useState<string | undefined>();
  const resetPassword = useResetUserPassword();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    formData.set('userId', user.id);
    setError(undefined);
    const result = await resetPassword.mutateAsync(formData);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success('Password reset');
    onOpenChange(false);
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
              <ShieldCheck size={15} />
            </span>
            Reset password
          </DialogTitle>
        </DialogHeader>
        {user && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
              <UsersIcon size={13} /> {user.email ?? user.phone}
            </p>
            <Field label="New password" name="newPassword" type="password" icon={Lock} />
            {error && <p className="text-[12.5px] font-bold text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={resetPassword.isPending}>
                {resetPassword.isPending ? 'Saving…' : 'Reset password'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
