import Link from 'next/link';
import { Phone, Store } from 'lucide-react';
import { loadStore } from '@/lib/store-public';
import { themeStyleTag } from '@/lib/theme-presets';
import { CartProvider } from '@/components/store/cart';
import { APP_NAME } from '@/lib/brand';

// The public web store (no login). A closed or unknown store shows a short
// notice instead of the catalog.
export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="max-w-sm rounded-xl2 border border-line bg-surface p-7 text-center shadow-card">
          <Store size={28} className="mx-auto text-ink-faint" />
          <h1 className="mt-3 text-[17px] font-extrabold text-ink">This store isn’t taking orders right now</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">Check the link, or contact the business directly.</p>
        </div>
      </main>
    );
  }
  const phone = store.settings.contactPhone || store.phone;
  return (
    <CartProvider slug={store.slug}>
      <style dangerouslySetInnerHTML={{ __html: themeStyleTag(store.themeColor) }} />
      <div className="min-h-screen bg-bg">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-4 py-3">
            <Link href={`/s/${store.slug}`} className="flex min-w-0 items-center gap-2.5">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logoUrl} alt="" className="h-9 w-9 rounded-md2 object-contain ring-1 ring-line" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-md2 bg-brand text-[13px] font-extrabold text-white">{store.name.slice(0, 2).toUpperCase()}</span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-extrabold text-ink">{store.name}</span>
                {store.settings.welcome && <span className="block truncate text-[11.5px] text-ink-faint">{store.settings.welcome}</span>}
              </span>
            </Link>
            {phone && (
              <a href={`tel:${phone.replace(/\s+/g, '')}`} className="ml-auto flex items-center gap-1.5 rounded-md2 border border-line px-3 py-2 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                <Phone size={14} /> <span className="hidden sm:inline">{phone}</span>
              </a>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1080px] px-4 py-5">{children}</main>
        <footer className="mx-auto max-w-[1080px] px-4 pb-28 pt-4 text-center text-[11px] text-ink-faint">
          Prices shown are before GST; checkout shows the total with GST. Orders are confirmed by {store.name}. Powered by {APP_NAME}.
        </footer>
      </div>
    </CartProvider>
  );
}
