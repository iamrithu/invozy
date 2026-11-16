import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCompanyForAdmin } from '@/actions/admin';
import { CompanyDetailClient } from './company-detail-client';

export const metadata: Metadata = { title: 'Company — Admin' };

export default async function AdminCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompanyForAdmin(id);
  if (!company) notFound();
  return <CompanyDetailClient company={company} />;
}
