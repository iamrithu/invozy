'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, Package, Users, Receipt, KeyRound, Mail, Phone, MapPin, IdCard, Clock } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { fmtInr } from '@/lib/gst';
import type { getCompanyForAdmin } from '@/actions/admin';
import { useCompanyForAdmin } from '@/hooks/use-admin';
import { ResetPasswordDialog, type CompanyUser } from '../../admin-companies-client';

type CompanyDetail = NonNullable<Awaited<ReturnType<typeof getCompanyForAdmin>>>;

export function CompanyDetailClient({ company: initial }: { company: CompanyDetail }) {
  const { data } = useCompanyForAdmin(initial.id, initial);
  const company = data ?? initial;
  const [resetTarget, setResetTarget] = useState<CompanyUser | null>(null);

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
          <div className="text-[17px] font-extrabold text-ink">{company.name}</div>
          <div className="mt-1 flex flex-wrap gap-3 text-[11.5px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} /> {company.state}
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
              <Clock size={12} /> Signed up {new Date(company.createdAt).toLocaleDateString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <StatCard icon={<Receipt size={14} />} label="Invoices" value={company._count.invoices} />
        <StatCard icon={<Users size={14} />} label="Customers" value={company._count.customers} />
        <StatCard icon={<Package size={14} />} label="Products" value={company._count.products} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <div className="mb-3 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">Users</div>
          <div className="space-y-2">
            {company.users.map((u: CompanyUser) => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-lg2 border border-line bg-bg p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-bold text-ink">{u.email ?? u.phone}</div>
                  <div className="text-[11px] text-ink-faint">Joined {new Date(u.createdAt).toLocaleDateString('en-IN')}</div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setResetTarget(u)}>
                  <KeyRound size={12} /> Reset password
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <div className="mb-3 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">Recent invoices</div>
          {company.recentInvoices.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-faint">No invoices yet.</p>
          ) : (
            <div className="space-y-1.5">
              {company.recentInvoices.map((inv: CompanyDetail['recentInvoices'][number]) => (
                <div key={inv.id} className="flex items-center gap-2.5 border-b border-dashed border-line py-1.5 text-[12.5px] last:border-0">
                  <span className="min-w-0 flex-1 truncate font-mono font-bold text-ink">{inv.number}</span>
                  <span className="flex-shrink-0 text-ink-faint">{inv.customerName}</span>
                  <StatusBadge status={inv.status} />
                  <span className="flex-shrink-0 font-mono font-bold text-ink">{fmtInr(inv.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ResetPasswordDialog user={resetTarget} onOpenChange={(open) => !open && setResetTarget(null)} />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-light text-brand-dark">{icon}</div>
      <div className="mt-2 font-mono text-[18px] font-extrabold text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}
