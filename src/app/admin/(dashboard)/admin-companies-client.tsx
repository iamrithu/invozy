'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, KeyRound, ShieldCheck, Users as UsersIcon, Mail, Phone, Lock, ChevronRight } from 'lucide-react';
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
import { useCompaniesForAdmin, useCreateCompany, useResetUserPassword } from '@/hooks/use-admin';
import { StateSelect } from '@/components/ui/location-field';

const PAGE_SIZE = 20;

export type CompanyUser = { id: string; email: string | null; phone: string | null; createdAt: string };
type Company = {
  id: string;
  name: string;
  state: string;
  gstin: string | null;
  createdAt: string;
  users: CompanyUser[];
  _count: { invoices: number; customers: number; products: number };
};

export function AdminCompaniesClient({ initialData }: { initialData: { items: Company[]; total: number } }) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<CompanyUser | null>(null);

  useEffect(() => setPage(1), [search]);

  const isDefaultParams = search === '' && page === 1;
  const { data, isFetching, isLoading } = useCompaniesForAdmin({ search, page, pageSize: PAGE_SIZE });
  const items = (isDefaultParams && !data ? initialData.items : data?.items ?? initialData.items) as Company[];
  const total = isDefaultParams && !data ? initialData.total : data?.total ?? initialData.total;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
            <Building2 size={18} className="text-brand" /> Companies
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">Every tenant workspace on Invozy.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={13} /> Add company
        </Button>
      </div>

      <div className="mb-3">
        <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search company name or owner email…" className="max-w-[340px]" />
      </div>

      <div className={`flex flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-card transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
        {isLoading ? (
          <SkeletonList />
        ) : total === 0 ? (
          <div className="p-8 text-center text-[13px] text-ink-faint">No companies match your search.</div>
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>GST</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Customers</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => {
                const owner = c.users[0];
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
                    <TableCell className="text-ink-soft">{owner ? owner.email ?? owner.phone : 'No user'}</TableCell>
                    <TableCell>
                      {c.gstin ? <Badge variant="green">Verified</Badge> : <Badge variant="default">Pending</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-ink-soft">{c._count.invoices}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-ink-soft">{c._count.customers}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-ink-soft">{c._count.products}</TableCell>
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

function AddCompanySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
              <div className="text-[11.5px] text-ink-faint">Create a tenant workspace and its first user</div>
            </div>
          </DialogFormHeader>
          <DialogFormBody className="space-y-3">
            <Field label="Company name" name="companyName" icon={Building2} error={fieldErrors.companyName} />
            <StateSelect name="state" value={selectedState} onChange={setSelectedState} error={fieldErrors.state} />
            <Field label="Owner email" name="email" type="email" icon={Mail} error={fieldErrors.email} />
            <Field label="Owner phone (optional if email set)" name="phone" icon={Phone} error={fieldErrors.phone} />
            <Field label="Password" name="password" type="password" icon={Lock} error={fieldErrors.password} />
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
