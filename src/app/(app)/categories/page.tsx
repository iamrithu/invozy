import type { Metadata } from 'next';
import { listCategories } from '@/actions/categories';
import { APP_NAME } from '@/lib/brand';
import { CategoriesClient } from './categories-client';

export const metadata: Metadata = { title: `Categories — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const data = await listCategories();
  return <CategoriesClient initialData={data} storeHost="/c/" />;
}
