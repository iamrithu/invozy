import type { Metadata } from 'next';
import { loadStore } from '@/lib/store-public';
import { StoreCatalog } from '@/components/store/store-catalog';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const store = await loadStore((await params).slug);
  return store ? { title: `${store.name} · Order online`, description: store.settings.welcome || `Order from ${store.name} online.` } : { title: 'Store' };
}

export default async function StorePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const [{ slug }, { c }] = await Promise.all([params, searchParams]);
  const store = await loadStore(slug);
  if (!store) return null;
  if (!store.products.length) return <p className="py-16 text-center text-[13.5px] text-ink-soft">Nothing on sale here yet. Check back soon.</p>;
  return <StoreCatalog slug={store.slug} categories={store.categories} products={store.products} initialCategory={typeof c === 'string' ? c : null} />;
}
