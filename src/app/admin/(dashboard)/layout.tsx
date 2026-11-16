import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/session';
import { APP_NAME } from '@/lib/brand';
import { AdminNav } from './admin-nav';
import { AdminUserMenu } from '@/components/shell/admin-user-menu';
import { ThemeToggle } from '@/components/shell/theme-toggle';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The proxy already redirects non-admins; this is the real check.
  if (!(await requireSuperAdmin().catch(() => null))) redirect('/admin/login');
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-40 flex h-[61px] flex-shrink-0 items-center gap-3 border-b border-line bg-chrome px-5 text-white">
        <Image src="/brand/logo.png" alt={APP_NAME} width={994} height={324} className="h-7 w-auto" />
        <span className="text-[13px] font-bold text-white/60">Admin</span>
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          <AdminUserMenu />
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-[200px] flex-shrink-0 flex-col gap-1 border-r border-line bg-surface p-3 md:flex">
          <AdminNav />
        </aside>
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
