'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuditLog } from '@/hooks/use-admin';
import type { listAuditLog } from '@/actions/admin';

type Page = Awaited<ReturnType<typeof listAuditLog>>;

/** Everything the platform admin (and the payment webhook) did — newest first. */
export function AuditClient({ initial }: { initial: Page }) {
  const [page, setPage] = useState(1);
  const { data } = useAuditLog({ page });
  const current = page === 1 && !data ? initial : data ?? initial;

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-[20px] font-extrabold text-ink">
        <ScrollText size={18} className="text-brand" /> Audit log
      </h1>
      <p className="mb-4 text-[12px] text-ink-faint">Every admin action, kept permanently — even for companies that have been deleted.</p>
      <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
        {current.items.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-ink-faint">Nothing yet.</p>
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>What</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-ink-faint">{new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                  <TableCell className="text-ink-soft">{r.actor}</TableCell>
                  <TableCell>
                    {r.companyId ? (
                      r.companyName ? (
                        <Link href={`/admin/companies/${r.companyId}`} className="font-bold text-ink hover:text-brand">
                          {r.companyName}
                        </Link>
                      ) : (
                        <span className="text-ink-faint">Deleted company</span>
                      )
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink">{r.summary}</TableCell>
                  <TableCell className="font-mono text-[11px] text-ink-faint">{r.ip ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination page={page} pageSize={50} total={current.total} onPageChange={setPage} />
      </div>
    </div>
  );
}
