import type { Metadata } from 'next';
import { listAuditLog } from '@/actions/admin';
import { AuditClient } from './audit-client';

export const metadata: Metadata = { title: 'Audit log — Admin' };

export default async function AdminAuditPage() {
  return <AuditClient initial={await listAuditLog({ page: 1, pageSize: 50 })} />;
}
