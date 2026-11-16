'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminCompanyDetail } from '@/actions/admin';
import { useDeleteCompany } from '@/hooks/use-admin';

/** Permanent deletion — only for a suspended company, with its name typed. */
export function CompanyDangerZone({ company }: { company: AdminCompanyDetail }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const del = useDeleteCompany();

  async function remove() {
    const res = await del.mutateAsync({ companyId: company.id, confirmName: name });
    if (res.error) return toast.error(res.error);
    toast.success(`${company.name} and all its data were deleted`);
    router.push('/admin');
  }

  return (
    <div className="rounded-xl2 border border-red/30 bg-surface p-4 shadow-card lg:col-span-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-extrabold uppercase tracking-wide text-red">
        <Trash2 size={13} /> Delete permanently
      </div>
      {company.active ? (
        <p className="text-[12px] text-ink-faint">Suspend the company first. Deleting removes every invoice, customer, product, login and file of {company.name} — it can’t be undone.</p>
      ) : (
        <>
          <p className="text-[12px] text-ink-soft">
            Removes every row and file of {company.name} for good{company.deletionRequestedAt ? ', as the owner asked' : ''}. The audit log keeps a record that it happened.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Type “${company.name}”`} className="max-w-[300px]" />
            <Button type="button" variant="outline" disabled={del.isPending || name.trim() !== company.name.trim()} onClick={remove}>
              <Trash2 size={12} /> {del.isPending ? 'Deleting…' : 'Delete everything'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
