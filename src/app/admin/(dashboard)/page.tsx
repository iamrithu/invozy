import type { Metadata } from 'next';
import { listCompaniesForAdmin } from '@/actions/admin';
import { AdminCompaniesClient } from './admin-companies-client';

export const metadata: Metadata = { title: 'Companies — Admin' };

const PAGE_SIZE = 20;

export default async function AdminCompaniesPage() {
  const initial = await listCompaniesForAdmin({ page: 1, pageSize: PAGE_SIZE });
  return <AdminCompaniesClient initialData={initial} />;
}
